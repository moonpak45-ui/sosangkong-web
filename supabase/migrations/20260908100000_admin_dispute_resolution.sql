-- ============================================================
-- 관리자 분쟁·클레임 처리(해결/반려) 기능
-- 대상 테이블: disputes, notifications
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 함수는 create or replace, 정책/트리거는 drop → create, 컬럼은
-- add column if not exists 로 작성되어 있습니다.)
--
-- 배경) 20260907050000_admin_role_rls.sql에서 disputes에 admin select
-- 정책만 추가됐고 insert/update 정책이 없어, 관리자를 포함해 아무도
-- disputes.status를 바꿀 수 없는 상태였습니다(RLS는 켜져 있는데 해당
-- 정책이 없으면 기본 거부). /admin/deals 분쟁·클레임 탭에서 "해결/반려"
-- 처리를 실제로 가능하게 하려면 admin update 정책이 필요합니다. insert
-- 정책은 테스트 데이터 생성 및 향후 "당사자가 분쟁 접수" 기능을 위해
-- 함께 추가합니다(지금은 접수 UI가 없어 admin 전용으로만 열어둠).
-- ============================================================

-- ------------------------------------------------------------
-- 1. 처리자 기록 컬럼 추가 (처리 시각은 기존 resolved_at 컬럼 재사용)
-- ------------------------------------------------------------
alter table disputes add column if not exists resolved_by uuid references users(id);

-- ------------------------------------------------------------
-- 2. 관리자 insert/update 정책
-- ------------------------------------------------------------
drop policy if exists disputes_insert_admin on disputes;
create policy disputes_insert_admin
  on disputes for insert
  with check (qd_is_admin());

drop policy if exists disputes_update_admin on disputes;
create policy disputes_update_admin
  on disputes for update
  using (qd_is_admin())
  with check (qd_is_admin());

-- ------------------------------------------------------------
-- 3. disputes.status가 open → resolved/rejected로 바뀌면 거래 당사자
--    (소상공인·공급업체) 양쪽에 알림 (선택 사항 - 없어도 해결/반려 처리
--    자체는 동작함). notifications.type도 ENUM(notification_type)이고
--    허용값이 quote/deal/review뿐이라(기존 notifications_triggers.sql
--    참고), 새 값을 추가하는 대신 이미 있는 'deal'을 재사용함.
-- ------------------------------------------------------------
create or replace function notify_on_dispute_resolved() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_buyer_user_id uuid;
  v_partner_user_id uuid;
  v_status_label text;
begin
  if new.status = old.status or new.status not in ('resolved', 'rejected') then
    return new;
  end if;

  select bp.user_id, p.user_id
    into v_buyer_user_id, v_partner_user_id
  from deals d
  left join buyer_profiles bp on bp.id = d.buyer_id
  left join partners p on p.id = d.partner_id
  where d.id = new.deal_id;

  v_status_label := case new.status when 'resolved' then '해결' else '반려' end;

  if v_buyer_user_id is not null then
    insert into notifications (user_id, type, title, body, related_id, is_read)
    values (
      v_buyer_user_id,
      'deal',
      '분쟁·클레임이 ' || v_status_label || ' 처리됐어요',
      '담당 관리자가 분쟁 건을 검토해 ' || v_status_label || ' 처리했습니다.',
      new.deal_id,
      false
    );
  end if;

  if v_partner_user_id is not null then
    insert into notifications (user_id, type, title, body, related_id, is_read)
    values (
      v_partner_user_id,
      'deal',
      '분쟁·클레임이 ' || v_status_label || ' 처리됐어요',
      '담당 관리자가 분쟁 건을 검토해 ' || v_status_label || ' 처리했습니다.',
      new.deal_id,
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_dispute_resolved on disputes;
create trigger trg_notify_on_dispute_resolved
  after update on disputes
  for each row
  execute function notify_on_dispute_resolved();
