-- ============================================================
-- E2E 테스트로 남은 walk-in 거래 데이터 정리 (v2 — RLS 명시적 우회)
-- Supabase SQL Editor에서 한 번만 실행하세요.
--
-- ⚠ v1(같은 파일명 이전 버전)을 실행했을 때 "Success"가 떴지만 실제로는
-- 아무 행도 지워지지 않았음을 별도 조회로 확인했습니다. 가장 유력한
-- 원인은 이 SQL을 실행하는 역할이 각 테이블의 RLS DELETE 정책(전부
-- qd_is_my_partner_id() 등 auth.uid() 기반이라, SQL Editor 세션에는
-- auth.uid()가 없어 어떤 정책도 통과하지 못함 - "0행 삭제, 에러 없음"이
-- 정확히 이 상황과 일치함)에 막혀 있었다는 것입니다. v2는 삭제 대상
-- 테이블마다 RLS를 명시적으로 껐다가(같은 트랜잭션 안에서) 바로 다시 켜서
-- 이 문제를 우회합니다 - 원인을 확신할 수 없어도 결과가 확실하도록.
--
-- 대상 5개 그림자 계정(business_name : 상태) — 이전 조회로 확인한 그대로:
--   E2E테스트마트285315 : 거래 없음(quote_id 에러로 실패한 시도)
--   E2E테스트마트989986 : 거래 없음(quote_id 에러로 실패한 시도)
--   E2E테스트마트497910 : 거래 1건
--   E2E테스트마트703972 : 거래 1건
--   E2EAI테스트792650   : 거래 1건(AI 파싱 품목 3개, 외상 99,990원)
-- 전부 test4@email.com(partner_id 49222eda-6c43-424b-bbff-744ef79ce703)
-- 소유이고 이메일이 `@sosangkong-walkin.invalid`로 끝나는 걸로 정확히
-- 식별했습니다(이 기능 코드에서만 생성되는 고유 마커 - 실제 서비스 계정과
-- 겹칠 수 없음).
--
-- RAISE NOTICE로 각 단계 삭제 건수를 출력합니다 - Supabase SQL Editor의
-- "Success" 아래 로그/결과 패널에서 실제로 몇 건씩 지워졌는지 확인하세요
-- (전부 0이면 이번에도 뭔가 막혔다는 뜻이니 실행 결과를 알려주세요).
-- ============================================================

do $$
declare
  v_shadow_user_ids uuid[] := array[
    'bf6a362d-82a6-4e02-a5c4-371a3bd8072d', -- E2E테스트마트285315
    '4bbe0eec-3827-4823-9db1-acbae61e36f4', -- E2E테스트마트989986
    '817854ee-e1ef-40ad-becc-a20925095f56', -- E2E테스트마트497910
    'f8fa0205-9f45-46f3-aa52-d71cb6c40346', -- E2E테스트마트703972
    '64a48eca-3e33-4f93-900a-ff8eba58e32f'  -- E2EAI테스트792650
  ];
  v_shadow_profile_ids uuid[] := array[
    '6c479874-3530-461d-b7a8-6653101d5e32', -- E2E테스트마트285315
    '75e5f087-02fd-483e-816b-90477fe776c8', -- E2E테스트마트989986
    'e26aa301-09db-4531-a63e-058b0489cd6f', -- E2E테스트마트497910
    '09794634-9b45-4efe-81b0-440bdf67629c', -- E2E테스트마트703972
    'cae2d98d-39c3-4e1e-861c-0ec1fa65a6a3'  -- E2EAI테스트792650
  ];
  v_deal_ids uuid[] := array[
    '542dba44-6f36-4432-bc6f-4ff2703a3d23', -- E2E테스트마트497910의 거래
    'beff0e94-f8f3-48e6-a756-1bf5f98a1739', -- E2E테스트마트703972의 거래
    '75a28da5-a98a-46b7-bfaf-d5bc90ca0d63'  -- E2EAI테스트792650의 거래
  ];
  v_partner_id uuid := '49222eda-6c43-424b-bbff-744ef79ce703'; -- test4@email.com(test공급식자재)
  v_count int;
begin
  -- 이 트랜잭션 동안만 RLS를 끔(끝나면 반드시 다시 켬 - 아래 참고)
  alter table notifications disable row level security;
  alter table item_aliases disable row level security;
  alter table ai_parse_logs disable row level security;
  alter table settlements disable row level security;
  alter table deal_line_items disable row level security;
  alter table ar_balances disable row level security;
  alter table deals disable row level security;
  alter table buyer_profiles disable row level security;
  alter table users disable row level security;

  delete from notifications where related_id = any(v_deal_ids);
  get diagnostics v_count = row_count; raise notice 'notifications deleted: %', v_count;

  delete from item_aliases where partner_id = v_partner_id
    and alias_text in ('새우 20박스', '생닭 15개 마리당 8000원', '얼린감자 10포 이번엔 외상으로 해주세요 월말에 정산할게요');
  get diagnostics v_count = row_count; raise notice 'item_aliases deleted: %', v_count;

  delete from ai_parse_logs where partner_id = v_partner_id
    and raw_text like '%새우 20박스%';
  get diagnostics v_count = row_count; raise notice 'ai_parse_logs deleted: %', v_count;

  delete from settlements where deal_id = any(v_deal_ids);
  get diagnostics v_count = row_count; raise notice 'settlements deleted: %', v_count;

  delete from deal_line_items where deal_id = any(v_deal_ids);
  get diagnostics v_count = row_count; raise notice 'deal_line_items deleted: %', v_count;

  delete from ar_balances where partner_id = v_partner_id and buyer_id = any(v_shadow_user_ids);
  get diagnostics v_count = row_count; raise notice 'ar_balances deleted: %', v_count;

  delete from deals where id = any(v_deal_ids);
  get diagnostics v_count = row_count; raise notice 'deals deleted: %', v_count;

  delete from buyer_profiles where id = any(v_shadow_profile_ids);
  get diagnostics v_count = row_count; raise notice 'buyer_profiles deleted: %', v_count;

  delete from users where id = any(v_shadow_user_ids);
  get diagnostics v_count = row_count; raise notice 'public.users deleted: %', v_count;

  -- auth.users는 별도 스키마라 RLS가 애초에 안 걸려있음(auth 스키마 테이블은
  -- Supabase가 자체 관리 - public 스키마 RLS와 무관), 그냥 삭제.
  delete from auth.users where id = any(v_shadow_user_ids);
  get diagnostics v_count = row_count; raise notice 'auth.users deleted: %', v_count;

  -- 반드시 원래대로 복구
  alter table notifications enable row level security;
  alter table item_aliases enable row level security;
  alter table ai_parse_logs enable row level security;
  alter table settlements enable row level security;
  alter table deal_line_items enable row level security;
  alter table ar_balances enable row level security;
  alter table deals enable row level security;
  alter table buyer_profiles enable row level security;
  alter table users enable row level security;
exception when others then
  -- 무슨 일이 있어도 RLS는 반드시 원상복구 (그 다음 원래 에러를 다시 던짐)
  alter table notifications enable row level security;
  alter table item_aliases enable row level security;
  alter table ai_parse_logs enable row level security;
  alter table settlements enable row level security;
  alter table deal_line_items enable row level security;
  alter table ar_balances enable row level security;
  alter table deals enable row level security;
  alter table buyer_profiles enable row level security;
  alter table users enable row level security;
  raise;
end $$;
