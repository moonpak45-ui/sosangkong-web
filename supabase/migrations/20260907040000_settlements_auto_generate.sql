-- ============================================================
-- 거래 확정 시 정산(settlements) 자동 생성
-- 대상 테이블: commission_models, categories, deals, settlements
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 작성했습니다: insert는 조건부, 함수는 create or replace, 트리거/정책은
-- drop → create 입니다.)
--
-- 전제) commission_models(id, name, type, config, ...), categories(...,
-- default_commission_model_id), deals(id, quote_id, buyer_id, partner_id,
-- category_id, amount, status, confirmed_at), settlements(id, deal_id,
-- commission_model_id, gross_amount, commission_amount, net_amount, status,
-- settled_at) 테이블/컬럼은 이미 Supabase에 존재한다고 가정합니다(리포에
-- 이 테이블들의 CREATE TABLE 구문이 없어 컬럼명이 요청 내용과 다르면 아래
-- SQL이 실행 시 에러가 날 수 있으니, 처음 실행할 때 컬럼명을 한 번 확인해
-- 주세요).
-- ============================================================

-- ------------------------------------------------------------
-- 0. 기본 수수료 모델 확인/생성
-- ------------------------------------------------------------

-- 이미 있으면 아무 것도 하지 않고, 없을 때만 하나 생성합니다.
insert into commission_models (name, type, config)
select '재화 거래 기본 수수료', 'transaction_percent', '{"rate_min":2,"rate_max":5}'::jsonb
where not exists (
  select 1 from commission_models where name = '재화 거래 기본 수수료'
);

-- 확인용 (직접 실행해서 결과를 보세요 — 이 마이그레이션 자체의 동작에는 영향 없음)
-- select * from commission_models where name = '재화 거래 기본 수수료';

-- ------------------------------------------------------------
-- 1. default_commission_model_id가 비어있는 카테고리에 기본 모델 연결
-- ------------------------------------------------------------
update categories
set default_commission_model_id = (
  select id from commission_models where name = '재화 거래 기본 수수료' limit 1
)
where default_commission_model_id is null;

-- ------------------------------------------------------------
-- 2. deals insert 시 settlements 자동 생성 트리거
--
-- 수수료율 규칙)
--  - 파트너 가입일(partners.created_at) 기준 90일 이내에 확정된 거래는
--    무료기간으로 0%
--  - 그 외에는 "이 거래가 속한 달"의 해당 파트너 누적 거래액(이 거래
--    포함, gross_amount 합)을 기준으로:
--      500만원 미만            → 5%
--      500만원 이상 2000만원 미만 → 3%
--      2000만원 이상            → 2%
-- ------------------------------------------------------------
create or replace function settlements_generate_on_deal_insert() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_created_at timestamptz;
  v_commission_model_id uuid;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_monthly_total numeric;
  v_rate numeric;
  v_commission_amount numeric;
  v_net_amount numeric;
begin
  select created_at into v_partner_created_at
  from partners
  where id = new.partner_id;

  select id into v_commission_model_id
  from commission_models
  where name = '재화 거래 기본 수수료'
  limit 1;

  if v_partner_created_at is not null and new.confirmed_at < v_partner_created_at + interval '90 days' then
    v_rate := 0;
  else
    v_month_start := date_trunc('month', new.confirmed_at);
    v_month_end := v_month_start + interval '1 month';

    select coalesce(sum(amount), 0) into v_monthly_total
    from deals
    where partner_id = new.partner_id
      and confirmed_at >= v_month_start
      and confirmed_at < v_month_end;

    if v_monthly_total < 5000000 then
      v_rate := 0.05;
    elsif v_monthly_total < 20000000 then
      v_rate := 0.03;
    else
      v_rate := 0.02;
    end if;
  end if;

  v_commission_amount := round(new.amount * v_rate);
  v_net_amount := new.amount - v_commission_amount;

  insert into settlements (
    deal_id, commission_model_id, gross_amount, commission_amount, net_amount, status, settled_at
  ) values (
    new.id, v_commission_model_id, new.amount, v_commission_amount, v_net_amount, 'pending', null
  );

  return new;
end;
$$;

drop trigger if exists trg_settlements_generate_on_deal_insert on deals;
create trigger trg_settlements_generate_on_deal_insert
  after insert on deals
  for each row
  execute function settlements_generate_on_deal_insert();

-- ------------------------------------------------------------
-- 3. settlements RLS: partner는 자신의 정산 내역만 select 가능
--
-- settlements에는 partner_id 컬럼이 없으므로 deal_id → deals.partner_id →
-- partners.user_id 경로로만 확인합니다. buyer_profiles는 전혀 참조하지
-- 않으므로 20260907010000에서 겪었던 순환 재귀 문제와는 무관합니다.
-- deals.partner_id 소유 확인은 20260907000000에서 만든
-- qd_is_my_partner_id() 헬퍼 함수(부재 시 이 파일보다 먼저 그 마이그레이션이
-- 실행되어 있어야 합니다)를 그대로 재사용합니다.
-- ------------------------------------------------------------
alter table settlements enable row level security;

drop policy if exists settlements_select_partner on settlements;
create policy settlements_select_partner
  on settlements for select
  using (
    exists (
      select 1 from deals d
      where d.id = settlements.deal_id
        and qd_is_my_partner_id(d.partner_id)
    )
  );

-- ------------------------------------------------------------
-- 4. deals: partner 본인 거래 select 정책 확인
--
-- 20260907000000_quotes_deals_policies.sql에서 이미
-- "deals_select_buyer_or_partner" 정책으로 buyer 본인 또는 partner 본인
-- (qd_is_my_partner_id(partner_id)) 거래를 select 할 수 있게 되어 있습니다.
-- 이미 존재하므로 이 마이그레이션에서는 별도로 추가하지 않습니다.
-- (아래는 참고용 확인 쿼리이며 이 마이그레이션 실행에는 필요하지 않습니다.)
-- select policyname, qual from pg_policies where tablename = 'deals';
-- ------------------------------------------------------------
