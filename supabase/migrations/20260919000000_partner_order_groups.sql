-- ============================================================
-- 거래처 주문 마감시간 설정 기능
-- 대상: 신규 테이블 partner_order_groups, partner_buyer_order_groups +
--       deal_line_items.expected_delivery_date 컬럼 추가
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- create table if not exists, drop policy if exists → create policy,
-- add column if not exists)
--
-- 배경) 공급업체가 배송요일+주문마감시간을 묶은 "주문그룹"을 만들고,
-- 거래처(소상공인)를 그 그룹에 배정. 실제 발주가 들어오는 시점(조사
-- 결과: deals가 아니라 deal_line_items insert 시점 - "거래전표 등록"/
-- "AI 빠른입력"이 매일 반복되는 실제 발주 입력 지점이고, deals는 거래
-- 관계를 처음 트는 1회성 이벤트라 마감시간 개념과 안 맞음)에 그 거래처가
-- 배정된 그룹의 마감시간을 기준으로 예상 배송일을 계산해
-- deal_line_items.expected_delivery_date에 저장함.
--
-- deals/deal_line_items 기존 컬럼·트리거는 전혀 안 건드림 - 컬럼 1개
-- 추가(nullable)뿐.
-- ============================================================

-- ------------------------------------------------------------
-- 1. partner_order_groups — 공급업체가 만드는 배송요일+마감시간 그룹
-- ------------------------------------------------------------
create table if not exists partner_order_groups (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  group_name text not null,
  -- 배송 요일: 0=일 1=월 2=화 3=수 4=목 5=금 6=토 (JS Date.getDay()와 동일)
  delivery_days smallint[] not null default '{}',
  cutoff_time time not null,
  allow_after_cutoff boolean not null default false,
  created_at timestamptz not null default now()
);

alter table partner_order_groups enable row level security;

drop policy if exists partner_order_groups_select_own on partner_order_groups;
create policy partner_order_groups_select_own
  on partner_order_groups for select
  using (qd_is_my_partner_id(partner_id));

drop policy if exists partner_order_groups_insert_own on partner_order_groups;
create policy partner_order_groups_insert_own
  on partner_order_groups for insert
  with check (qd_is_my_partner_id(partner_id));

drop policy if exists partner_order_groups_update_own on partner_order_groups;
create policy partner_order_groups_update_own
  on partner_order_groups for update
  using (qd_is_my_partner_id(partner_id))
  with check (qd_is_my_partner_id(partner_id));

drop policy if exists partner_order_groups_delete_own on partner_order_groups;
create policy partner_order_groups_delete_own
  on partner_order_groups for delete
  using (qd_is_my_partner_id(partner_id));

-- ------------------------------------------------------------
-- 2. partner_buyer_order_groups — 거래처(buyer_profiles) → 그룹 배정
--    (파트너마다 같은 소상공인을 다른 그룹에 배정할 수 있어야 해서
--    buyer_profiles에 컬럼을 추가하지 않고 별도 매핑 테이블로 분리함)
--    행이 없으면 "그룹 미지정 = 마감시간 제한 없음"(기존 동작 그대로).
--    그룹을 지우면(위 1번) 배정 행도 같이 지워져 자동으로 미지정 상태로
--    돌아감(on delete cascade).
-- ------------------------------------------------------------
create table if not exists partner_buyer_order_groups (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  buyer_id uuid not null references buyer_profiles(id) on delete cascade,
  order_group_id uuid not null references partner_order_groups(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (partner_id, buyer_id)
);

alter table partner_buyer_order_groups enable row level security;

drop policy if exists partner_buyer_order_groups_select_own on partner_buyer_order_groups;
create policy partner_buyer_order_groups_select_own
  on partner_buyer_order_groups for select
  using (qd_is_my_partner_id(partner_id));

drop policy if exists partner_buyer_order_groups_insert_own on partner_buyer_order_groups;
create policy partner_buyer_order_groups_insert_own
  on partner_buyer_order_groups for insert
  with check (qd_is_my_partner_id(partner_id));

drop policy if exists partner_buyer_order_groups_update_own on partner_buyer_order_groups;
create policy partner_buyer_order_groups_update_own
  on partner_buyer_order_groups for update
  using (qd_is_my_partner_id(partner_id))
  with check (qd_is_my_partner_id(partner_id));

drop policy if exists partner_buyer_order_groups_delete_own on partner_buyer_order_groups;
create policy partner_buyer_order_groups_delete_own
  on partner_buyer_order_groups for delete
  using (qd_is_my_partner_id(partner_id));

-- ------------------------------------------------------------
-- 3. deal_line_items — 계산된 예상 배송일 저장(nullable, 그룹 미지정
--    거래처는 계속 null - 화면에서 "제한 없음"으로 처리)
-- ------------------------------------------------------------
alter table deal_line_items add column if not exists expected_delivery_date date;
