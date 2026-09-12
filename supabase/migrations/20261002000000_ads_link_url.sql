-- ============================================================
-- ads.link_url 컬럼 추가 (배너 클릭 시 이동할 URL)
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- add column if not exists 패턴 + link_url is null 조건부 업데이트)
--
-- 배경) 롤링 배너(AdRollingBanner.tsx)는 지금까지 partner_id가 있는
-- 광고만 `/partner/<partner_id>`로 링크했음(제3자 광고주 직접 등록 광고는
-- 애초에 연결할 상세 페이지가 없어 링크 없음). 관리자가 제3자 광고주를
-- 직접 등록할 때 임의의 외부 URL을 지정하고, 파트너 신청 광고는 자기
-- 업체 상세 페이지 경로를 자동으로 채우도록 link_url 컬럼을 추가함.
-- 이제 AdRollingBanner.tsx는 partner_id가 아니라 link_url 유무만으로
-- 클릭 가능 여부를 판단하므로, 기존에 이미 게재중이던 파트너 배너가
-- link_url 없이 클릭 안 되게 퇴행하지 않도록 partner_id 기반 경로로
-- 한 번 백필함.
-- ============================================================
alter table ads add column if not exists link_url text;

update ads
set link_url = '/partner/' || partner_id::text
where link_url is null and partner_id is not null;
