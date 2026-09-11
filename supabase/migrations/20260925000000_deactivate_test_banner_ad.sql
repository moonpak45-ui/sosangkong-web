-- ============================================================
-- 프로덕션에 남아있던 테스트 배너 광고 비활성화
-- Supabase SQL Editor에서 한 번만 실행하세요.
--
-- 배경) BuyerHomeFeed 상단 롤링배너(AdRollingBanner)에 검은 박스가
-- 뜬다는 리포트를 받아 anon key로 ads 테이블을 직접 조회해보니, status=
-- 'active'인 배너 광고 하나가 test4@email.com(partner_id 49222eda-6c43-
-- 424b-bbff-744ef79ce703 — 20260916000000_cleanup_e2e_test_data.sql에
-- 나오는 그 테스트 계정)의 banner_image_url을 가리키고 있었고, 그 파일이
-- 실제로는 1x1 픽셀짜리 68바이트 PNG였습니다. 배너 영역 크기(width:100%,
-- height:clamp(90px,16vw,180px))에 objectFit:cover로 늘어나면서 그
-- 픽셀 색상 그대로 꽉 찬 검은 박스처럼 보인 것 — 컴포넌트 버그가 아니라
-- 실수로 active 승인된 테스트 이미지가 원인.
--
-- 조치) 20260912000000_ads_system.sql의 기존 관례대로("이미 active인
-- 광고를 내리고 싶으면 rejected로 재전환") DELETE 대신 status만
-- 'rejected'로 전환. id를 명시해서 이 특정 테스트 광고 1건만 건드림.
-- ============================================================

update ads
set status = 'rejected'
where id = '3fcf396b-bff0-4c6d-8129-2c8cf8db1b9e'
  and partner_id = '49222eda-6c43-424b-bbff-744ef79ce703'
  and ad_type = 'banner'
returning id, partner_id, ad_type, status, banner_image_url;
