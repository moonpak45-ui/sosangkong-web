-- ============================================================
-- "AI 거래전표 빠른입력" 1차(텍스트 붙여넣기 버전)
-- 대상: 신규 테이블 item_aliases, ai_parse_logs
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 —
-- create table if not exists, drop policy if exists → create policy)
--
-- 배경) 기존 "거래전표 등록"(deal_line_items insert → 트리거로 재고차감/
-- 외상잔액 자동갱신, 20260909000000_ledgerbook_phase1.sql)은 이미 완성돼
-- 있음. 이번 작업은 그 시스템에 "카톡 텍스트 붙여넣기 → AI 초안 → 사람
-- 확인 → 확정" 입력 방식을 하나 더 추가하는 것뿐 — deal_line_items 테이블
-- 자체와 트리거(ledgerbook_on_line_item_insert)는 이 마이그레이션에서
-- 전혀 건드리지 않음. 확정 시 클라이언트가 기존과 완전히 동일한 insert
-- 호출(같은 컬럼, 같은 테이블)을 하므로 트리거는 자동으로 그대로 작동함.
-- ============================================================

-- ------------------------------------------------------------
-- 1. item_aliases — "새우20박스" 같은 원문 표현 → 실제 품목명 매핑 학습
-- ------------------------------------------------------------
create table if not exists item_aliases (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  alias_text text not null,
  matched_item_name text not null,
  use_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, alias_text)
);

alter table item_aliases enable row level security;

drop policy if exists item_aliases_select_own on item_aliases;
create policy item_aliases_select_own
  on item_aliases for select
  using (qd_is_my_partner_id(partner_id));

drop policy if exists item_aliases_insert_own on item_aliases;
create policy item_aliases_insert_own
  on item_aliases for insert
  with check (qd_is_my_partner_id(partner_id));

-- upsert(있으면 use_count 증가, 없으면 insert)를 클라이언트에서 select 후
-- insert/update로 처리하므로 update 정책도 필요.
drop policy if exists item_aliases_update_own on item_aliases;
create policy item_aliases_update_own
  on item_aliases for update
  using (qd_is_my_partner_id(partner_id))
  with check (qd_is_my_partner_id(partner_id));

-- ------------------------------------------------------------
-- 2. ai_parse_logs — AI 분석 원문/결과 기록(품질 개선 추적 + 사용량 집계용)
--    원문에 거래처명·연락처 등 개인정보가 포함될 수 있어 본인(partner)만
--    조회 가능하도록 제한. update/delete 정책 없음(추가만 되는 로그).
-- ------------------------------------------------------------
create table if not exists ai_parse_logs (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  raw_text text not null,
  parsed_result jsonb not null,
  was_edited boolean not null default false,
  created_at timestamptz not null default now()
);

alter table ai_parse_logs enable row level security;

drop policy if exists ai_parse_logs_select_own on ai_parse_logs;
create policy ai_parse_logs_select_own
  on ai_parse_logs for select
  using (qd_is_my_partner_id(partner_id));

drop policy if exists ai_parse_logs_insert_own on ai_parse_logs;
create policy ai_parse_logs_insert_own
  on ai_parse_logs for insert
  with check (qd_is_my_partner_id(partner_id));
