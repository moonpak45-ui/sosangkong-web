-- ============================================================
-- 재고관리북(ledgerbook) 2단계 — 소상공인(buyer) 조회 권한
-- 대상 테이블: ar_balances (deal_line_items는 변경 불필요 — 아래 참고)
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 정책은 drop → create 로 작성되어 있습니다.)
--
-- 확인) 실행 전에 실제 계정으로 확인해보니 deal_line_items는 1단계
-- (20260909000000_ledgerbook_phase1.sql)의 deal_line_items_select_participant
-- 정책이 이미 "그 거래의 buyer 또는 partner"를 허용하고 있어서 소상공인이
-- 이미 자신의 거래전표를 조회할 수 있었습니다(별도 정책 추가 불필요,
-- test01 계정으로 실제 조회해 확인함). 그래서 이 마이그레이션은
-- ar_balances에만 buyer용 select 정책을 추가합니다.
--
-- stock_levels는 스펙대로 buyer select 정책을 의도적으로 추가하지 않습니다
-- (공급업체 재고는 소상공인에게 노출하지 않음).
-- ============================================================

drop policy if exists ar_balances_select_buyer on ar_balances;
create policy ar_balances_select_buyer
  on ar_balances for select
  using (buyer_id = auth.uid());
