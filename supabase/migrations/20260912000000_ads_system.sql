-- ============================================================
-- 광고 시스템 신설 (박스광고/줄광고/무료/롤링배너 4종)
-- 대상: 신규 테이블 ads, 신규 Storage 버킷 partner-ad-banners
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- create table if not exists, drop policy if exists → create policy,
-- insert ... on conflict do nothing 으로 작성되어 있습니다.)
--
-- 배경) "기존 광고 시스템(박스광고/줄광고/무료)에 배너 유형을 추가한다"는
-- 전제로 작업 지시가 들어왔지만, 실제로는 ads 테이블도 /partner/ads/apply,
-- /admin/ads 화면도 이 리포에 전혀 없었습니다(코드/마이그레이션 전체
-- grep으로 확인 — 있는 건 마케팅 랜딩의 "광고 (준비 중)" 정적 문구 하나
-- 뿐). 그래서 이 마이그레이션은 "배너 유형 추가"가 아니라 광고 시스템
-- 자체(4종 전부)를 이번에 처음 만드는 것입니다. 사용자에게 확인 후
-- "전체를 새로 설계"하는 방향으로 진행하기로 함.
--
-- 이번 범위에서 합리적으로 가정/확정한 것 (실제 요구사항이 따로 생기면
-- 재조정 필요 — 아래 항목들은 전부 HANDOFF.md에도 동일하게 기록함):
-- 1) 승인 플로우는 4종 전부 동일: 공급업체가 신청(status='pending') →
--    관리자가 (시스템 밖에서) 오프라인 입금 확인 등을 마친 뒤 화면에서
--    수동 승인(status='active') 또는 반려(status='rejected' +
--    reject_reason). 실제 결제 연동은 없음 — 이 프로젝트 어디에도 결제
--    연동이 없어 계좌이체를 사람이 눈으로 확인하는 기존 관례를 그대로 확장.
-- 2) box/line/free 3종은 이번에 "신청 → 승인" 플로우까지만 만들고, 승인된
--    이후 실제 노출 위치(예: 검색결과 상단 고정)는 구현하지 않습니다 —
--    어디에 어떻게 노출할지 스펙이 전혀 없어 추측성 UI를 만들지 않기로
--    판단(HANDOFF에 다음 작업 후보로 남겨둠). banner만 실제 노출까지
--    이번에 연동합니다(BuyerHomeFeed 롤링 배너) — 이번 작업 지시가 명시적
--    으로 요구한 부분이라 여기만 실제 구현.
-- 3) status는 'pending'|'active'|'rejected' 3가지만 둡니다(별도 'expired'
--    없음 — 자동 만료 배치/cron이 이 프로젝트에 아직 없어 자동 전환 로직을
--    새로 만들지 않음). 이미 'active'인 광고를 관리자가 내리고 싶으면
--    'rejected'로 재전환하는 것으로 처리(화면에 "게재 중단" 버튼).
-- 4) 정렬 순서는 신청 시각(created_at) 오름차순 — 별도 우선순위/
--    display_order 컬럼 없음(요청에 없었음, 필요해지면 다음에 추가).
-- 5) 가격/기간 등 상품 정책은 DB에 저장하지 않습니다 — 화면에 안내
--    텍스트로만 표시(app/partner/ads/apply/page.tsx 참고). 실제 가격
--    정책이 정해지면 그때 반영.
-- 6) admin_role 구분 없이 qd_is_admin()(sub_admin 포함) 기준으로 승인 권한을
--    줬습니다 — 회원관리·거래견적관리와 동일한 수준으로 판단, 필요하면
--    나중에 qd_is_super_admin()으로 좁힐 수 있음.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ads 테이블
-- ------------------------------------------------------------
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  ad_type text not null check (ad_type in ('box', 'line', 'free', 'banner')),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  banner_image_url text,
  memo text,
  reject_reason text,
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ads_banner_image_required
    check (ad_type <> 'banner' or banner_image_url is not null)
);

alter table ads enable row level security;

-- [공급업체] 본인 소유 partner의 광고만 신청(insert) 가능, 항상 pending으로만
-- 시작(직접 active/rejected로 등록하는 걸 방지). qd_is_my_partner_id는
-- 20260907000000_quotes_deals_policies.sql에서 만든 기존 헬퍼를 재사용
-- (이 마이그레이션보다 먼저 실행되어 있어야 함).
drop policy if exists ads_insert_own on ads;
create policy ads_insert_own
  on ads for insert
  with check (qd_is_my_partner_id(partner_id) and status = 'pending');

-- [공급업체] 본인 광고 신청 목록/상태 조회
drop policy if exists ads_select_own on ads;
create policy ads_select_own
  on ads for select
  using (qd_is_my_partner_id(partner_id));

-- [공개] 실제 게재 중인(active) 배너(banner)만 조회 가능 — /search가
-- 비로그인도 되는 것과 동일한 관례로, 굳이 로그인만 따로 막지 않음
-- (BuyerHomeFeed 자체가 buyer 로그인 전용이라 실제로는 buyer만 이 쿼리를
-- 실행하지만, 정책 자체를 로그인 여부로 좁힐 이유는 없다고 판단).
drop policy if exists ads_select_public_active_banner on ads;
create policy ads_select_public_active_banner
  on ads for select
  using (status = 'active' and ad_type = 'banner');

-- [관리자] 전체 조회 + 승인/반려(update)
drop policy if exists ads_select_admin_all on ads;
create policy ads_select_admin_all
  on ads for select
  using (qd_is_admin());

drop policy if exists ads_update_admin on ads;
create policy ads_update_admin
  on ads for update
  using (qd_is_admin())
  with check (qd_is_admin());

-- ------------------------------------------------------------
-- 2. Storage 버킷 partner-ad-banners (배너 이미지)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('partner-ad-banners', 'partner-ad-banners', true)
on conflict (id) do nothing;

-- 공개 버킷 — 이미지는 누구나 조회 가능해야 getPublicUrl()로 받은 URL을
-- <img src>에 바로 써서 화면에 표시할 수 있음.
drop policy if exists partner_ad_banners_select_public on storage.objects;
create policy partner_ad_banners_select_public
  on storage.objects for select
  using (bucket_id = 'partner-ad-banners');

-- 업로드는 본인 partner id로 시작하는 경로(<partner_id>/파일명)에만 허용.
-- 클라이언트 업로드 코드(app/partner/ads/apply/page.tsx)가 항상 이 경로
-- 규칙을 따름 — storage.foldername(name)은 경로를 '/'로 쪼갠 배열을 반환
-- (예: 'abc-123-uuid/1699999999-banner.png' → {'abc-123-uuid'}).
drop policy if exists partner_ad_banners_insert_own on storage.objects;
create policy partner_ad_banners_insert_own
  on storage.objects for insert
  with check (
    bucket_id = 'partner-ad-banners'
    and qd_is_my_partner_id(((storage.foldername(name))[1])::uuid)
  );
