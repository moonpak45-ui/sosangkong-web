-- ============================================================
-- partners에 주소(address) 컬럼 추가
-- 대상 테이블: partners
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- add column if not exists)
--
-- 배경) 표준 거래명세서 양식(재고관리북 3단계 재작업)의 공급자 정보
-- 박스에 주소가 필요한데, partners에는 없고 buyer_profiles에만 있었음
-- (실제 컬럼 확인함). 기존 행이 있으므로 NOT NULL을 강제하지 않고
-- nullable로 추가.
-- ============================================================

alter table partners add column if not exists address text;
