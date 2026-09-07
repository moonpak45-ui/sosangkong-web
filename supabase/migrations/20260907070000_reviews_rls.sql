-- ============================================================
-- 거래 완료 후 리뷰 작성 기능 - RLS 정책
-- 대상 테이블: reviews
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 함수는 create or replace, 정책은 drop → create, 제약조건은 존재 확인
-- 후 추가하도록 작성되어 있습니다.)
--
-- 전제) reviews(id, deal_id, buyer_id, overall_rating, sub_ratings jsonb,
-- tags jsonb, content, is_anonymous, created_at) 테이블은 이미 Supabase에
-- 존재한다고 가정합니다. 리포에 이 테이블의 CREATE TABLE 구문이 없어
-- 실제 컬럼명이 다르면 이 SQL이 에러가 날 수 있습니다. partners.rating_avg
-- / review_count는 이미 트리거로 자동 갱신되고 있다고 하셨으므로 이
-- 마이그레이션에서는 건드리지 않습니다.
-- ============================================================

-- ------------------------------------------------------------
-- 0. 헬퍼 함수: 이 deal_id가 정말 이 buyer_id의 거래인지 확인
--
-- deals 테이블 하나만 조회합니다 (buyer_profiles를 다시 참조하지 않음).
-- buyer 소유 확인 자체는 20260907000000에서 만든 qd_is_my_buyer_id()를
-- 그대로 재사용하므로, 이 함수와 합쳐도 buyer_profiles는 딱 한 번만
-- 조회됩니다 — 20260907010000에서 겪었던 순환 재귀 문제와 무관합니다.
-- ------------------------------------------------------------
create or replace function qd_owns_deal_as_buyer(p_deal_id uuid, p_buyer_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from deals where id = p_deal_id and buyer_id = p_buyer_id
  );
$$;

-- ------------------------------------------------------------
-- 1. reviews RLS 활성화
-- ------------------------------------------------------------
alter table reviews enable row level security;

-- [요청하신 정책] 리뷰는 비로그인 포함 누구나 select 가능
drop policy if exists reviews_select_public on reviews;
create policy reviews_select_public
  on reviews for select
  using (true);

-- [요청하신 정책] insert는 본인이 실제로 거래한 deal_id/buyer_id 조합에만 허용
drop policy if exists reviews_insert_buyer_own_deal on reviews;
create policy reviews_insert_buyer_own_deal
  on reviews for insert
  with check (
    qd_is_my_buyer_id(buyer_id)
    and qd_owns_deal_as_buyer(deal_id, buyer_id)
  );

-- ------------------------------------------------------------
-- 2. 거래(deal_id)당 리뷰 1개만 허용 (DB 레벨 unique 제약)
-- 애플리케이션에서도 이미 리뷰를 쓴 거래는 "리뷰 완료"로 비활성화하지만,
-- 동시 요청 등으로 인한 중복 insert를 DB 레벨에서 최종적으로 막습니다.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_deal_id_unique'
  ) then
    alter table reviews add constraint reviews_deal_id_unique unique (deal_id);
  end if;
end $$;
