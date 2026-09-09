-- ============================================================
-- "거래처 주문 마감시간 설정" 기능을 실제로 검증하기 위해 만든 테스트
-- 데이터(all식당 × test공급식자재) 정리.
-- Supabase SQL Editor에서 한 번만 실행하세요.
--
-- 배경) 마감 전/마감 후/시간외 허용/그룹 미지정 4가지 케이스를 실제
-- 브라우저에서 확인하기 위해 test4@email.com(test공급식자재) 계정으로
-- 주문그룹 "과거마감테스트"를 만들고 all식당(test01@test.com,
-- buyer_profiles.id 57c94ae1-24da-48ba-b4e2-1d448e2c06db)에 배정한 뒤,
-- 실제 거래(deal id 37dbc5d5-4dc2-4231-bd6b-a2b3a537f6e0)에 테스트
-- 품목(마감테스트품목, 3개, 3,000원, is_credit=false)을 하나 등록해
-- expected_delivery_date가 실제로 저장되는지까지 확인함.
--
-- 정리 대상:
--   1) deal_line_items 1건(마감테스트품목) - is_credit=false라
--      ar_balances 영향 없고, 이 품목명이 stock_levels에 등록돼 있지
--      않아(사전 조회로 확인) 재고 차감도 없었음.
--   2) partner_order_groups 1건("과거마감테스트") - 삭제하면
--      partner_buyer_order_groups의 배정 행도 on delete cascade로
--      자동 삭제됨(마이그레이션 20260919000000에서 그렇게 설계함) -
--      별도로 안 지워도 됨.
--
-- 이전 정리들과 동일한 이유로 RLS를 트랜잭션 안에서 명시적으로 껐다 켬
-- (SQL Editor 세션엔 auth.uid()가 없어 DELETE가 조용히 0건으로 끝나는
-- 문제 - HANDOFF.md 참고).
-- ============================================================

do $$
declare
  v_line_item_id uuid := 'e9f3e912-049a-4af6-8ce2-a2e59dc3dd4f'; -- 마감테스트품목
  v_group_id uuid := '3634c00e-4b73-4f61-8106-468e62ec0d66'; -- 과거마감테스트
  v_count int;
begin
  alter table deal_line_items disable row level security;
  alter table partner_order_groups disable row level security;
  alter table partner_buyer_order_groups disable row level security;

  delete from deal_line_items where id = v_line_item_id;
  get diagnostics v_count = row_count; raise notice 'deal_line_items deleted: %', v_count;

  delete from partner_order_groups where id = v_group_id;
  get diagnostics v_count = row_count; raise notice 'partner_order_groups deleted (cascades to partner_buyer_order_groups): %', v_count;

  alter table deal_line_items enable row level security;
  alter table partner_order_groups enable row level security;
  alter table partner_buyer_order_groups enable row level security;
exception when others then
  alter table deal_line_items enable row level security;
  alter table partner_order_groups enable row level security;
  alter table partner_buyer_order_groups enable row level security;
  raise;
end $$;
