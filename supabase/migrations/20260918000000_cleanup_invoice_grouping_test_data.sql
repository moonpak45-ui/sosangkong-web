-- ============================================================
-- "일자별 거래명세서 통합 처리" 기능을 실제로 검증하기 위해 만든 테스트
-- 데이터(all식당 × test공급식자재, 같은 날짜 거래 3건) 정리.
-- Supabase SQL Editor에서 한 번만 실행하세요.
--
-- 배경) 검증을 위해 test01@test.com(all식당, buyer_profiles.id
-- 57c94ae1-24da-48ba-b4e2-1d448e2c06db) 명의로 test4@email.com
-- (test공급식자재, partners.id 49222eda-6c43-424b-bbff-744ef79ce703)
-- 앞으로 같은 날짜(2026-09-09)에 거래 3건을 만들고 각각 품목을 1개씩
-- (테스트-소스A/B/C) 등록해 "진행 중인 거래" 화면에서 같은 날짜+거래처가
-- 한 행으로 병합되는지, 명세서 인쇄가 3건의 품목을 한 장에 합치는지
-- 실제로 확인함.
--
-- 정리 대상 및 부작용:
--   1) deal_line_items 3건 (테스트-소스A/B/C)
--      - 이 중 테스트-소스B(is_credit=true, 45,000원)가
--        ledgerbook_on_line_item_insert 트리거로 ar_balances를
--        100,000원 -> 145,000원으로 올려놓음(트리거는 INSERT에만 붙어
--        있어 삭제해도 자동으로 안 돌아옴 - 아래에서 수동으로 원복).
--      - stock_levels에는 이 품목명들이 등록돼 있지 않아(사전 조회로
--        확인) 재고 차감은 없었음 - 재고 원복 불필요.
--   2) settlements 3건 - deals INSERT 시
--      settlements_generate_on_deal_insert 트리거가 자동 생성한
--      정산 행(전부 status='pending', 아직 정산 안 됨) - deals와 함께 삭제.
--   3) deals 3건 (c101eefa-..., 64a2e33a-..., 965d073b-...)
--   4) ar_balances 원복: 145,000원 -> 100,000원(테스트로 추가된 외상분
--      45,000원만 정확히 차감 - 절대값으로 덮어쓰지 않고 balance에서
--      45000을 빼는 방식으로, 그 사이 실제 거래가 더 생겼어도 안전하게 처리).
--
-- 이전 정리들과 동일한 이유로 RLS를 트랜잭션 안에서 명시적으로 껐다 켬
-- (SQL Editor 세션엔 auth.uid()가 없어 DELETE/UPDATE가 조용히 0건으로
-- 끝나는 문제 - HANDOFF.md 참고).
-- ============================================================

do $$
declare
  v_deal_ids uuid[] := array[
    'c101eefa-5ff8-47f8-b1e3-cf188c710306',
    '64a2e33a-0c14-40bd-b956-04c3eb31a25a',
    '965d073b-b3be-4499-9f0b-b7e6a865a80c'
  ];
  v_line_item_ids uuid[] := array[
    'f2110661-8980-4cb5-9387-fbf8a97070df', -- 테스트-소스A
    '7aab913f-ed57-4005-8424-350d7817a6fd', -- 테스트-소스B (is_credit)
    '73115d50-8927-43bb-ae4d-d01714f86421'  -- 테스트-소스C
  ];
  v_ar_balance_id uuid := '26e195b5-9cb8-4b31-a247-1229e60aa720';
  v_count int;
begin
  alter table deal_line_items disable row level security;
  alter table settlements disable row level security;
  alter table deals disable row level security;
  alter table ar_balances disable row level security;

  delete from deal_line_items where id = any(v_line_item_ids);
  get diagnostics v_count = row_count; raise notice 'deal_line_items deleted: %', v_count;

  delete from settlements where deal_id = any(v_deal_ids);
  get diagnostics v_count = row_count; raise notice 'settlements deleted: %', v_count;

  delete from deals where id = any(v_deal_ids);
  get diagnostics v_count = row_count; raise notice 'deals deleted: %', v_count;

  update ar_balances set balance = balance - 45000, updated_at = now() where id = v_ar_balance_id;
  get diagnostics v_count = row_count; raise notice 'ar_balances updated: %', v_count;

  alter table deal_line_items enable row level security;
  alter table settlements enable row level security;
  alter table deals enable row level security;
  alter table ar_balances enable row level security;
exception when others then
  alter table deal_line_items enable row level security;
  alter table settlements enable row level security;
  alter table deals enable row level security;
  alter table ar_balances enable row level security;
  raise;
end $$;
