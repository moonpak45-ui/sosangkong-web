-- ============================================================
-- partner_categories 공개 select 정책 (재확인/재적용)
-- 대상 테이블: partner_categories
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전)
--
-- 배경) 이 정책은 원래 20260907060000_partner_profile_update_policies.sql
-- 에 이미 포함되어 있습니다. /quote-request에서 "선택한 업체의 카테고리
-- 정보를 확인할 수 없습니다" 에러가 계속 발생한다면, 그 마이그레이션이
-- 아직 실행되지 않았을 가능성이 높습니다. 이 파일은 그중 select 정책
-- 부분만 다시 명시적으로 적용합니다.
--
-- 주의) 20260907060000에 있던 partners_update_own,
-- partner_categories_insert_own/delete_own 정책은 이 파일에 포함하지
-- 않았습니다. 공급업체 프로필 수정 화면(/partner/profile)에서 카테고리를
-- 저장하는 기능까지 쓰려면 20260907060000도 함께 실행해야 합니다.
--
-- partner_categories는 검색/견적요청에 필요한 공개 정보이므로 인증
-- 여부와 무관하게 select 가능하도록 합니다.
-- ============================================================

alter table partner_categories enable row level security;

drop policy if exists partner_categories_select_public on partner_categories;
create policy partner_categories_select_public
  on partner_categories for select
  using (true);
