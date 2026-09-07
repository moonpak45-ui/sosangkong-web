-- ============================================================
-- 알림함 기능 - RLS + 자동 생성 트리거
-- 대상 테이블: notifications, quotes, deals, quote_request_targets, reviews
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 함수는 create or replace, 정책/트리거는 drop → create 로 작성되어
-- 있습니다.)
--
-- 전제) notifications(id, user_id, type, title, body, related_id, is_read,
-- created_at) 테이블은 이미 Supabase에 존재한다고 가정합니다. 리포에 이
-- 테이블의 CREATE TABLE 구문이 없어 실제 컬럼명이 다르면 이 SQL이 에러가
-- 날 수 있습니다.
--
-- 설계 노트) 아래 4개 트리거 함수는 모두 SECURITY DEFINER로 만들어 RLS를
-- 우회합니다. 예를 들어 "파트너가 견적을 제출"하는 순간 이 트리거가
-- buyer_profiles를 조회해서 그 buyer의 user_id로 알림을 꽂아야 하는데,
-- 이 파트너 계정은 원래 그 buyer_profiles 행을 select할 RLS 권한이
-- 없습니다. 트리거가 SECURITY DEFINER이므로 이 조회 자체는 문제없이
-- 동작하고, notifications 테이블 자체의 RLS(본인 것만 select/update)는
-- 그대로 유지됩니다.
-- ============================================================

-- ------------------------------------------------------------
-- 0. notifications RLS
-- ------------------------------------------------------------
alter table notifications enable row level security;

-- [요청하신 정책] 본인 알림만 select 가능
drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own
  on notifications for select
  using (user_id = auth.uid());

-- [요청하신 정책] 본인 알림만 update 가능 (읽음 처리용)
drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- insert는 아래 트리거 함수들(SECURITY DEFINER)을 통해서만 발생하므로
-- 별도의 insert 정책은 추가하지 않습니다(일반 사용자는 notifications에
-- 직접 insert할 수 없고, 이것이 의도된 동작입니다).

-- ------------------------------------------------------------
-- 1. quotes insert → 견적요청의 buyer에게 type='quote' 알림
-- ------------------------------------------------------------
create or replace function notify_on_quote_insert() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_buyer_user_id uuid;
  v_partner_name text;
begin
  select bp.user_id into v_buyer_user_id
  from quote_requests qr
  join buyer_profiles bp on bp.id = qr.buyer_id
  where qr.id = new.quote_request_id;

  select name into v_partner_name from partners where id = new.partner_id;

  if v_buyer_user_id is not null then
    insert into notifications (user_id, type, title, body, related_id, is_read)
    values (
      v_buyer_user_id,
      'quote',
      coalesce(v_partner_name, '업체') || '에서 견적을 보내왔어요',
      coalesce(v_partner_name, '업체') || '가 ' || to_char(new.price, 'FM999,999,999') || '원으로 견적을 보냈어요.',
      new.quote_request_id,
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_quote_insert on quotes;
create trigger trg_notify_on_quote_insert
  after insert on quotes
  for each row
  execute function notify_on_quote_insert();

-- ------------------------------------------------------------
-- 2. deals insert → buyer와 partner 양쪽에 type='deal' 알림
-- ------------------------------------------------------------
create or replace function notify_on_deal_insert() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_buyer_user_id uuid;
  v_buyer_name text;
  v_partner_user_id uuid;
  v_partner_name text;
begin
  select user_id, business_name into v_buyer_user_id, v_buyer_name
  from buyer_profiles where id = new.buyer_id;

  select user_id, name into v_partner_user_id, v_partner_name
  from partners where id = new.partner_id;

  if v_buyer_user_id is not null then
    insert into notifications (user_id, type, title, body, related_id, is_read)
    values (
      v_buyer_user_id,
      'deal',
      '거래가 확정됐어요',
      coalesce(v_partner_name, '업체') || '와의 거래가 ' || to_char(new.amount, 'FM999,999,999') || '원에 확정됐습니다.',
      new.id,
      false
    );
  end if;

  if v_partner_user_id is not null then
    insert into notifications (user_id, type, title, body, related_id, is_read)
    values (
      v_partner_user_id,
      'deal',
      coalesce(v_buyer_name, '소상공인') || '과의 거래가 확정됐어요',
      '거래 금액: ' || to_char(new.amount, 'FM999,999,999') || '원',
      new.id,
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_deal_insert on deals;
create trigger trg_notify_on_deal_insert
  after insert on deals
  for each row
  execute function notify_on_deal_insert();

-- ------------------------------------------------------------
-- 3. quote_request_targets insert → 발송 대상 partner에게 type='quote' 알림
-- ------------------------------------------------------------
create or replace function notify_on_quote_request_target_insert() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_partner_user_id uuid;
begin
  select user_id into v_partner_user_id from partners where id = new.partner_id;

  if v_partner_user_id is not null then
    insert into notifications (user_id, type, title, body, related_id, is_read)
    values (
      v_partner_user_id,
      'quote',
      '새로운 견적요청이 도착했어요',
      '견적요청 내용을 확인하고 회신해보세요.',
      new.quote_request_id,
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_qrt_insert on quote_request_targets;
create trigger trg_notify_on_qrt_insert
  after insert on quote_request_targets
  for each row
  execute function notify_on_quote_request_target_insert();

-- ------------------------------------------------------------
-- 4. reviews insert → 대상 partner에게 type='review' 알림
-- ------------------------------------------------------------
create or replace function notify_on_review_insert() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_partner_user_id uuid;
begin
  select user_id into v_partner_user_id from partners where id = new.partner_id;

  if v_partner_user_id is not null then
    insert into notifications (user_id, type, title, body, related_id, is_read)
    values (
      v_partner_user_id,
      'review',
      '거래 후기가 등록됐어요',
      '새로 등록된 리뷰를 확인해보세요.',
      new.deal_id,
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_review_insert on reviews;
create trigger trg_notify_on_review_insert
  after insert on reviews
  for each row
  execute function notify_on_review_insert();
