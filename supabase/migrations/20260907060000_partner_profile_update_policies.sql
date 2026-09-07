-- ============================================================
-- 공급업체 "프로필 · 배송조건 관리" 화면을 위한 RLS 정책
-- 대상 테이블: partners, partner_categories
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 정책은 drop → create 로 작성되어 있습니다.)
--
-- 확인 결과)
-- - partners: 지금까지 update 정책이 전혀 없었습니다. 20260907050000에서
--   관리자용 update 정책(partners_update_admin)만 추가했을 뿐, 파트너
--   본인이 자기 partners 행을 update할 수 있는 정책은 없었습니다.
-- - partner_categories: 지금까지 RLS 자체가 꺼져 있었습니다
--   (20260907000000 마이그레이션 주석 참고). 그런데 이 테이블은 /search,
--   /quote-request, /partner/[id], /my-page 등에서 로그인 여부와 무관하게
--   "다른 파트너"의 취급 카테고리를 공개 조회합니다. 그래서 이번에 RLS를
--   켜면서 기존 공개 조회 동작이 깨지지 않도록 공개 select 정책을
--   partner 본인 insert/delete 정책과 함께 추가합니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. partners: 본인 소유 행 update 허용
--
-- 테이블 단위 정책이라 name/biz_reg_no/region/description 외에 status,
-- verified_badge 등 다른 컬럼도 기술적으로는 본인이 수정할 수 있습니다
-- (buyer_profiles_update_own과 동일한 설계 전제 — RLS는 컬럼 단위 제한을
-- 지원하지 않습니다).
-- ------------------------------------------------------------
drop policy if exists partners_update_own on partners;
create policy partners_update_own
  on partners for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. partner_categories
-- ------------------------------------------------------------
alter table partner_categories enable row level security;

-- [기존 동작 유지용] 취급 카테고리는 공개 정보이므로 누구나 select 가능
-- (/search, /quote-request, /partner/[id], /my-page 등에서 다른 파트너의
-- 카테고리를 표시하는 데 필요)
drop policy if exists partner_categories_select_public on partner_categories;
create policy partner_categories_select_public
  on partner_categories for select
  using (true);

-- [요청하신 정책] 본인 소유 partner의 카테고리만 insert 가능
-- (20260907000000에서 만든 qd_is_my_partner_id() 헬퍼 재사용)
drop policy if exists partner_categories_insert_own on partner_categories;
create policy partner_categories_insert_own
  on partner_categories for insert
  with check (qd_is_my_partner_id(partner_id));

-- [요청하신 정책] 본인 소유 partner의 카테고리만 delete 가능
drop policy if exists partner_categories_delete_own on partner_categories;
create policy partner_categories_delete_own
  on partner_categories for delete
  using (qd_is_my_partner_id(partner_id));
