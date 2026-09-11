-- ============================================================
-- 테스트 계정(test4@email.com)의 남은 박스/줄광고 비활성화
-- Supabase SQL Editor에서 한 번만 실행하세요.
--
-- 배경) BuyerHomeFeed/search의 박스광고·줄광고 노출 기능을 실제 active
-- 데이터로 검증하던 중, partner_id 49222eda-6c43-424b-bbff-744ef79ce703
-- (test4@email.com, 20260916000000_cleanup_e2e_test_data.sql에도 나오는
-- 그 테스트 계정)의 박스광고 2건(그중 1건은 이미 만료), 줄광고 1건이
-- status='active'로 남아 실제 화면에 노출되고 있었음. 배너 건(
-- 20260925000000_deactivate_test_banner_ad.sql)과 동일한 이유로 정리.
--
-- 조치) 이 테스트 계정 소유의 active 광고를 전부(박스/줄/혹시 남은 다른
-- 유형까지) rejected로 전환. partner_id 자체가 순수 테스트 계정이라
-- ad_type을 따로 좁히지 않고 이 계정 소유 active 광고 전체를 대상으로 함.
-- ============================================================

update ads
set status = 'rejected'
where partner_id = '49222eda-6c43-424b-bbff-744ef79ce703'
  and status = 'active'
returning id, ad_type, status, end_date;
