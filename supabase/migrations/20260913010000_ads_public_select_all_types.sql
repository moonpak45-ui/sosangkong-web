-- ============================================================
-- 광고 공개 조회 정책을 banner 전용 → active 전체로 확장
-- 대상 테이블: ads
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- drop policy if exists → create policy)
--
-- 배경) box/line 실제 노출 작업 중 발견한 버그. 20260912000000_ads_system.sql
-- 에서 만든 공개 select 정책(ads_select_public_active_banner)이
-- "status='active' and ad_type='banner'"로 좁게 걸려 있어서, box/line
-- 광고를 승인(active)해도 buyer 쪽 쿼리(BuyerHomeFeed)가 RLS에 막혀
-- 빈 배열만 받았음(JS 로직 버그가 아니라 RLS가 원인이었음 — 실제 네트워크
-- 요청/응답을 직접 캡처해서 확인함, 요청 자체는 200이지만 body가 항상 []).
--
-- 조치) 정책을 banner 전용에서 "status='active'인 모든 ad_type"으로
-- 넓힘. free 타입도 같이 풀리지만, free는 아직 실제 노출 화면이 없어서
-- (BuyerHomeFeed가 free를 조회하는 코드 자체가 없음) 실질적인 영향 없음 —
-- 나중에 free도 노출 화면을 만들 때 이 정책을 다시 손볼 필요가 없어진다는
-- 장점만 있음.
-- ============================================================

drop policy if exists ads_select_public_active_banner on ads;
drop policy if exists ads_select_public_active on ads;
create policy ads_select_public_active
  on ads for select
  using (status = 'active');
