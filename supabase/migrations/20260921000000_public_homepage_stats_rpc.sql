-- ============================================================
-- 메인 홈(비로그인 랜딩) 실시간 활동 카운터용 집계 전용 RPC
-- 대상: 신규 함수 qd_public_homepage_stats() (테이블 변경 없음)
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- create or replace function으로 작성)
--
-- 배경) 메인 홈에 "오늘 등록된 신규 거래 / 현재 검토 중인 견적 / 등록된
-- 공급업체" 3개 실시간 카운터를 넣으려 했으나, deals/quote_request_targets는
-- select 정책이 buyer/partner 본인 또는 admin만 허용하고 공개 정책이
-- 없음(20260907000000_quotes_deals_policies.sql) - 비로그인 방문자가 그대로
-- count 쿼리를 날리면 RLS에 막혀 항상 0으로 나옴. 이 프로젝트는 service
-- role key가 없어 서버사이드 우회도 불가능(다른 관리자 기능들도 같은
-- 이유로 signUp() 세션 전환 패턴을 쓰고 있음 - 20260908130000 등 참고).
--
-- 조치) 개별 거래/견적 행을 노출하는 select 정책을 추가하는 대신, "숫자
-- 3개"만 반환하는 집계 전용 함수를 만들고 그 함수의 실행 권한만 anon에
-- 부여함. 거래 금액·당사자 id 등 row 단위 데이터는 전혀 노출되지 않음
-- (qd_is_admin() 등 기존 security definer 헬퍼 함수와 같은 패턴).
--
-- 집계 기준:
-- - deals_today: deals.confirmed_at이 "오늘"(KST 기준)인 행 수. deals에는
--   created_at이 따로 없고 confirmed_at만 있음(HANDOFF.md에 이미 문서화된
--   전제 - 이 앱에서는 거래 확정 시점을 생성 시점과 동일하게 취급).
-- - quotes_waiting: quote_request_targets.status = 'waiting'인 행 수
--   (아직 공급업체가 응답하지 않은, 검토 중인 견적).
-- - partners_approved: partners.status = 'approved'인 행 수(공개 페이지라
--   심사 대기/정지 업체는 제외하고 실제 이용 가능한 업체만 집계).
-- ============================================================

create or replace function qd_public_homepage_stats()
returns table (
  deals_today integer,
  quotes_waiting integer,
  partners_approved integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    (
      select count(*)::integer from deals
      where confirmed_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
        and confirmed_at < ((date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul')
    ) as deals_today,
    (
      select count(*)::integer from quote_request_targets where status = 'waiting'
    ) as quotes_waiting,
    (
      select count(*)::integer from partners where status = 'approved'
    ) as partners_approved;
$$;

grant execute on function qd_public_homepage_stats() to anon;
grant execute on function qd_public_homepage_stats() to authenticated;
