-- ============================================================
-- 찜한 업체(favorites) 기능
-- 대상 테이블: favorites (신규)
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 테이블은 create if not exists, 정책은 drop → create 로 작성되어 있습니다.)
--
-- 주의) 이전에 buyer_profiles RLS에서 무한 재귀를 겪었던 경험(see
-- 20260907010000_buyer_profiles_policies_fix.sql)에 따라, 이 정책들은
-- buyer_profiles 하나만 서브쿼리로 참조하고 partners 등 다른 테이블은
-- 다시 join하지 않습니다. favorites -> buyer_profiles 단방향 참조만
-- 존재하고 buyer_profiles 쪽 정책은 favorites를 전혀 모르므로 순환이
-- 발생할 수 없습니다.
-- ============================================================

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references buyer_profiles(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (buyer_id, partner_id)
);

alter table favorites enable row level security;

-- select: 본인(buyer)의 찜 목록만 조회 가능
drop policy if exists favorites_select_own on favorites;
create policy favorites_select_own
  on favorites for select
  using (buyer_id in (select id from buyer_profiles where user_id = auth.uid()));

-- insert: 본인 명의로만 찜 추가 가능
drop policy if exists favorites_insert_own on favorites;
create policy favorites_insert_own
  on favorites for insert
  with check (buyer_id in (select id from buyer_profiles where user_id = auth.uid()));

-- delete: 본인 찜만 해제 가능
drop policy if exists favorites_delete_own on favorites;
create policy favorites_delete_own
  on favorites for delete
  using (buyer_id in (select id from buyer_profiles where user_id = auth.uid()));
