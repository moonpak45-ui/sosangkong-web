-- ============================================================
-- 관리자 직접 광고 등록 지원 (제3자 광고주, 공급업체 아님)
-- 대상: ads 테이블, storage.objects(partner-ad-banners 버킷)
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- add column/constraint if not exists 패턴 + drop policy if exists →
-- create policy)
--
-- 배경) /admin/ads에 "광고 직접 등록" 폼을 추가하기 전 조사한 결과:
-- 1) ads.partner_id는 20260912000000_ads_system.sql에서
--    `not null references partners(id) on delete cascade`로 정의돼 있어,
--    관리자가 공급업체 없이(제3자 광고주로) 광고를 등록하려면 이 컬럼을
--    nullable로 바꿔야 함.
-- 2) /admin/ads, /partner/ads/apply, app/search/page.tsx,
--    components/AdRollingBanner.tsx 전부 `ad.partners?.name`처럼 옵셔널
--    체이닝으로 partners 조인 결과에 접근하고 있어(지금까지 partner_id가
--    NOT NULL이라 실제로 null이었던 적은 없음) partner_id를 nullable로
--    바꾸는 것 자체는 기존 화면을 깨뜨리지 않음.
-- 3) 다만 box/line 광고는 /search에서 SupplierResultCard(파트너
--    이름/지역/평점 등 partners 테이블 전체 컬럼에 의존하는 컴포넌트)로
--    렌더링되므로, partner_id가 null인 box/line 광고는 이번 작업만으로는
--    /search에 실제로 노출되지 않음(범위 밖 — 별도 렌더링 경로 구현 필요).
--    banner(롤링배너)는 이미지+링크만 쓰므로 이번 작업으로 정상 노출됨
--    (components/AdRollingBanner.tsx도 함께 수정 — partner_id가 없으면
--    상세페이지 링크를 만들지 않도록).
-- ============================================================

-- ------------------------------------------------------------
-- 1. ads.partner_id nullable + 광고주명 컬럼
-- ------------------------------------------------------------
alter table ads alter column partner_id drop not null;
alter table ads add column if not exists advertiser_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ads_partner_or_advertiser_required'
  ) then
    alter table ads
      add constraint ads_partner_or_advertiser_required
      check (partner_id is not null or advertiser_name is not null);
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. [관리자] 광고 직접 등록 insert 정책
-- 기존 ads_insert_own은 "본인 소유 partner + status='pending'"만 허용해
-- 관리자 직접등록(partner_id 없음, status='active' 즉시 게재)에는 못 씀.
-- ------------------------------------------------------------
drop policy if exists ads_insert_admin on ads;
create policy ads_insert_admin
  on ads for insert
  with check (qd_is_admin());

-- ------------------------------------------------------------
-- 3. [관리자] partner-ad-banners 버킷에 admin/ 경로로 이미지 업로드 허용
-- 기존 partner_ad_banners_insert_own은 <partner_id>/... 경로 + 본인 파트너
-- 확인이라 관리자 직접등록(파트너 소속 아님)에는 못 씀. 경로를 admin/로
-- 강제해서 기존 파트너 업로드 경로와 섞이지 않게 함.
-- ------------------------------------------------------------
drop policy if exists partner_ad_banners_insert_admin on storage.objects;
create policy partner_ad_banners_insert_admin
  on storage.objects for insert
  with check (
    bucket_id = 'partner-ad-banners'
    and qd_is_admin()
    and (storage.foldername(name))[1] = 'admin'
  );
