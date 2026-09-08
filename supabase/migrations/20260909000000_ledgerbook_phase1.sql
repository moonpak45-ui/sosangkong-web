-- ============================================================
-- 재고관리북(ledgerbook) 1단계 — 거래전표, 외상잔액, 재고
-- 대상 테이블: deal_line_items(신규), ar_balances(신규), stock_levels(신규)
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 테이블은 create table if not exists, 함수는 create or replace, 정책/
-- 트리거는 drop → create 로 작성되어 있습니다.)
--
-- 원칙) 새 시스템을 만들지 않고 기존 deals/settlements 자동생성 트리거
-- 패턴(20260907040000_settlements_auto_generate.sql)을 그대로 재사용합니다.
-- deals(id, quote_id, buyer_id, partner_id, category_id, amount, status,
-- confirmed_at)와 헬퍼 함수 qd_is_my_partner_id(uuid)/qd_is_my_buyer_id(uuid)
-- (둘 다 20260907000000_quotes_deals_policies.sql에서 생성됨)를 그대로
-- 재사용합니다 — 이 파일보다 먼저 실행되어 있어야 합니다.
--
-- ⚠ 스펙과 다르게 구현한 부분 한 가지) 트리거 SQL에서 ar_balances.buyer_id에
-- 채워 넣는 값을 deals.buyer_id 그대로 쓰지 않고 buyer_profiles.user_id로
-- 한 번 변환했습니다. 이유: ar_balances.buyer_id는 스펙대로 auth.users(id)를
-- 참조하는데, 실 데이터로 직접 확인해보니 deals.buyer_id는 auth.users.id가
-- 아니라 buyer_profiles.id입니다(예: 실제 deal 행에서 buyer_id=87ff1b91...는
-- buyer_profiles.id이고, 같은 소상공인의 auth 계정 id는 b8c9801f...로 서로
-- 다름 — qd_is_my_buyer_id() 정의에서도 deals.buyer_id를 buyer_profiles.id로
-- 취급합니다). 스펙의 트리거 SQL을 글자 그대로 쓰면 신용거래(is_credit=true)
-- 라인을 등록할 때마다 ar_balances_buyer_id_fkey 위반으로 매번 실패하므로,
-- buyer_profiles를 한 번 더 조회해 auth.users.id로 변환하는 부분만 추가했고
-- 나머지 로직(외상잔액 upsert, 재고 차감, 재고 행 없으면 조용히 skip)은
-- 스펙 그대로입니다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. deal_line_items — 거래전표(품목 단위 상세)
-- ------------------------------------------------------------
create table if not exists deal_line_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id),
  item_name text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null default '개',
  unit_price numeric not null check (unit_price >= 0),
  amount numeric generated always as (quantity * unit_price) stored,
  is_credit boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. ar_balances — 거래처(소상공인)별 외상잔액
-- ------------------------------------------------------------
create table if not exists ar_balances (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id),
  buyer_id uuid not null references auth.users(id),
  balance numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (partner_id, buyer_id)
);

-- ------------------------------------------------------------
-- 3. stock_levels — 공급업체별 품목 재고
-- ------------------------------------------------------------
create table if not exists stock_levels (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id),
  item_name text not null,
  quantity_on_hand numeric not null default 0,
  unit text not null default '개',
  updated_at timestamptz not null default now(),
  unique (partner_id, item_name)
);

-- ------------------------------------------------------------
-- 4. deal_line_items insert 시 외상잔액/재고 자동 갱신 트리거
--    (기존 settlements_generate_on_deal_insert()와 동일한 패턴)
-- ------------------------------------------------------------
create or replace function ledgerbook_on_line_item_insert() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_deal_buyer_profile_id uuid;
  v_buyer_user_id uuid;
begin
  select partner_id, buyer_id into v_partner_id, v_deal_buyer_profile_id
  from deals where id = new.deal_id;

  if new.is_credit then
    -- ar_balances.buyer_id는 auth.users(id) 참조라, deals.buyer_id
    -- (=buyer_profiles.id)를 buyer_profiles.user_id로 변환해서 씀
    select user_id into v_buyer_user_id
    from buyer_profiles where id = v_deal_buyer_profile_id;

    insert into ar_balances (partner_id, buyer_id, balance, updated_at)
    values (v_partner_id, v_buyer_user_id, new.amount, now())
    on conflict (partner_id, buyer_id)
    do update set balance = ar_balances.balance + new.amount, updated_at = now();
  end if;

  -- stock_levels에 해당 품목 행이 없으면 이 UPDATE는 0행에 적용되고
  -- 조용히 아무 일도 일어나지 않음(자동 생성하지 않음 — 스펙 의도대로).
  update stock_levels
  set quantity_on_hand = quantity_on_hand - new.quantity, updated_at = now()
  where partner_id = v_partner_id and item_name = new.item_name;

  return new;
end;
$$;

drop trigger if exists trg_ledgerbook_line_item_insert on deal_line_items;
create trigger trg_ledgerbook_line_item_insert
  after insert on deal_line_items
  for each row
  execute function ledgerbook_on_line_item_insert();

-- ------------------------------------------------------------
-- 5. RLS: deal_line_items — 거래 당사자만 접근
-- ------------------------------------------------------------
alter table deal_line_items enable row level security;

-- insert는 그 거래의 partner 본인만
drop policy if exists deal_line_items_insert_partner on deal_line_items;
create policy deal_line_items_insert_partner
  on deal_line_items for insert
  with check (
    exists (
      select 1 from deals d
      where d.id = deal_line_items.deal_id
        and qd_is_my_partner_id(d.partner_id)
    )
  );

-- select는 그 거래의 buyer 또는 partner 본인만
drop policy if exists deal_line_items_select_participant on deal_line_items;
create policy deal_line_items_select_participant
  on deal_line_items for select
  using (
    exists (
      select 1 from deals d
      where d.id = deal_line_items.deal_id
        and (qd_is_my_buyer_id(d.buyer_id) or qd_is_my_partner_id(d.partner_id))
    )
  );

-- ------------------------------------------------------------
-- 6. RLS: ar_balances — partner 본인만 select, insert/update는 트리거만
-- ------------------------------------------------------------
alter table ar_balances enable row level security;

drop policy if exists ar_balances_select_partner on ar_balances;
create policy ar_balances_select_partner
  on ar_balances for select
  using (qd_is_my_partner_id(partner_id));

-- insert/update 정책을 의도적으로 추가하지 않음 → 클라이언트(anon/authenticated
-- 키)로는 기본 거부, SECURITY DEFINER 트리거(ledgerbook_on_line_item_insert)를
-- 통해서만 값이 들어감.

-- ------------------------------------------------------------
-- 7. RLS: stock_levels — partner 본인만 select, 초기 등록 화면에서만 insert
--    허용, update는 트리거만
-- ------------------------------------------------------------
alter table stock_levels enable row level security;

drop policy if exists stock_levels_select_partner on stock_levels;
create policy stock_levels_select_partner
  on stock_levels for select
  using (qd_is_my_partner_id(partner_id));

drop policy if exists stock_levels_insert_partner on stock_levels;
create policy stock_levels_insert_partner
  on stock_levels for insert
  with check (qd_is_my_partner_id(partner_id));

-- update 정책 없음(기본 거부) → 재고 차감은 트리거로만 발생.
