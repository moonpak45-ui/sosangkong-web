-- ============================================================
-- buyer_profiles를 "deals로 연결된 파트너"에게도 공개 — walk-in 거래처
-- 이름이 파트너 화면에 안 보이던 버그 수정
-- 대상 테이블: buyer_profiles
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- create or replace function, drop policy if exists → create policy)
--
-- 배경) "새 거래처로 시작하기"(lib/createWalkInDeal.ts)로 실제 테스트해
-- 발견한 버그. 기존 buyer_profiles_select_partner_target 정책
-- (20260907010000_buyer_profiles_policies_fix.sql)은
-- qd_is_buyer_visible_to_partner()로 "이 소상공인이 나에게 견적요청을
-- 보낸 적이 있는가"(quote_requests → quote_request_targets 경로)만
-- 확인함. walk-in 거래는 애초에 견적요청 자체가 없이 deals를 바로
-- 만들기 때문에 이 경로에 안 걸려서, 방금 만든 거래처의
-- buyer_profiles가 그 거래를 만든 파트너 본인에게도 안 보였음
-- (/partner/dashboard/deals의 "소상공인" 컬럼이 "-"로 표시되는 것으로
-- 실제 확인함).
--
-- 조치) "이 소상공인과 실제 deals 행으로 연결된 파트너"도 볼 수 있게
-- 하는 새 헬퍼 함수 + 정책을 추가함(기존 정책은 안 건드림 - 순수 추가).
-- qd_is_buyer_visible_to_partner()와 동일한 패턴으로 buyer_profiles를
-- 다시 SELECT하지 않아(deals/partners만 조회) 재귀 위험 없음.
-- ============================================================

create or replace function qd_is_buyer_visible_to_partner_via_deal(p_buyer_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from deals d
    join partners p on p.id = d.partner_id
    where d.buyer_id = p_buyer_id
      and p.user_id = auth.uid()
  );
$$;

drop policy if exists buyer_profiles_select_partner_deal_target on buyer_profiles;
create policy buyer_profiles_select_partner_deal_target
  on buyer_profiles for select
  using (qd_is_buyer_visible_to_partner_via_deal(id));
