-- ============================================================
-- 그리드형 UI 재설계 테스트로 실제 거래(all식당 × test공급식자재)에
-- 섞여 들어간 테스트 품목 6건 정리
-- Supabase SQL Editor에서 한 번만 실행하세요.
--
-- 배경) "거래전표 등록" 그리드 UI와 AI 빠른입력의 LineItemGrid 연동을
-- 실제 계정(test4@email.com)의 실제(견적 기반) 거래 - deal id
-- 37dbc5d5-4dc2-4231-bd6b-a2b3a537f6e0(all식당, 185,000원) - 로 테스트
-- 하면서 진짜 품목(냉동 흰살생선/얼음/청경채) 사이에 테스트 품목 6건이
-- 섞여 들어감:
--   - E2E그리드품목A / E2E그리드품목B (수동 그리드 입력 테스트)
--   - 오이 / 애호박 (AI 빠른입력 테스트, 총 2세트 - 첫 시도는 그리드
--     빈 행 검증 버그로 실패했다가 고친 뒤 재시도해서 한 세트 더 생김)
-- 전부 is_credit=false라 ar_balances 영향 없고, 이 품목명들이
-- stock_levels에 등록돼 있지도 않아(별도 조회로 확인) 재고 차감도 없었음
-- - deal_line_items 6개 행만 삭제하면 완전히 원상복구됨.
--
-- 이전 정리(20260916000000)와 동일한 이유로 RLS를 트랜잭션 안에서
-- 명시적으로 껐다 켬(SQL Editor 세션엔 auth.uid()가 없어 DELETE가
-- 조용히 0건으로 끝나는 문제 - HANDOFF 참고).
-- ============================================================

do $$
declare
  v_line_item_ids uuid[] := array[
    '3b464381-2f09-46d3-94f0-3dbbd606c065', -- E2E그리드품목A
    '6b18ea68-2518-4a2f-ae19-6b87d9d95b34', -- E2E그리드품목B
    'edb596e5-124a-40e9-96fc-8274639569e1', -- 오이 (1차)
    '0ec40f14-9034-4bc6-aa4d-18d456c3696d', -- 애호박 (1차)
    '778c0ab5-cc26-4944-b4d0-5daa345f4df9', -- 오이 (2차)
    '86b5007f-2129-470f-8e9b-57e2550de3b1'  -- 애호박 (2차)
  ];
  v_count int;
begin
  alter table deal_line_items disable row level security;

  delete from deal_line_items where id = any(v_line_item_ids);
  get diagnostics v_count = row_count; raise notice 'deal_line_items deleted: %', v_count;

  alter table deal_line_items enable row level security;
exception when others then
  alter table deal_line_items enable row level security;
  raise;
end $$;
