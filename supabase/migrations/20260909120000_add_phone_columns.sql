-- ============================================================
-- partners/buyer_profiles에 연락처(phone) 컬럼 추가
-- 대상 테이블: partners, buyer_profiles
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- add column if not exists)
--
-- 배경) 거래명세서(재고관리북 3단계, /partner/dashboard/deals/[id]/invoice)에
-- 표시할 "연락처" 데이터가 두 테이블 다 없어서 '-'로만 표시하고 있었음.
-- 기존 행이 이미 있으므로 NOT NULL을 강제하지 않고 nullable로 추가.
-- ============================================================

alter table partners add column if not exists phone text;
alter table buyer_profiles add column if not exists phone text;
