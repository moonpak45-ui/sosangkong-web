-- ============================================================
-- buyer_profiles RLS 정책 재설계 (무한 재귀 수정)
-- 대상 테이블: buyer_profiles
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요.
--
-- 배경) buyer_profiles에 "파트너가 자신에게 견적요청한 소상공인 정보를 볼 수
-- 있게" 하는 정책이 Supabase에 직접 추가되어 있었고, 이 정책(혹은 정책이
-- 참조하는 quote_requests 등)이 buyer_profiles를 다시 SELECT하는 경로를
-- 만들어 "infinite recursion detected in policy for relation
-- buyer_profiles" 에러가 발생했습니다.
--
-- 원인) 기존 마이그레이션(20260907000000)의 qd_is_my_buyer_id() /
-- qd_is_request_owner() 함수는 본문에서 buyer_profiles를 직접 SELECT합니다.
-- buyer_profiles 자신의 정책이 (직접이든, quote_requests를 거쳐 간접적으로든)
-- 이 함수들을 다시 호출하면 "buyer_profiles 정책 평가 → buyer_profiles 재조회
-- → buyer_profiles 정책 재평가"로 고리가 닫힙니다.
--
-- 해결) buyer_profiles를 절대 SELECT하지 않는 새 헬퍼 함수
-- qd_is_buyer_visible_to_partner(p_buyer_id uuid)를 만듭니다. 확인 대상인
-- buyer_profiles.id는 파라미터로 바깥에서 전달받고, 함수 본문은
-- quote_requests / quote_request_targets / partners 세 테이블만 조회하므로
-- buyer_profiles로 되돌아오는 경로 자체가 없어 구조적으로 재귀가 불가능합니다.
--
-- 기존에 Supabase에 직접 추가하신 정책의 정확한 이름을 알 수 없으므로,
-- buyer_profiles에 걸려 있는 정책을 이름과 무관하게 전부 제거한 뒤
-- 아래 3개 정책으로 다시 만듭니다.
-- ============================================================

-- ------------------------------------------------------------
-- 0. 헬퍼 함수 (buyer_profiles를 SELECT하지 않음 — 재귀 방지)
-- ------------------------------------------------------------
create or replace function qd_is_buyer_visible_to_partner(p_buyer_id uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from quote_requests qr
    join quote_request_targets qrt on qrt.quote_request_id = qr.id
    join partners p on p.id = qrt.partner_id
    where qr.buyer_id = p_buyer_id
      and p.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- 1. buyer_profiles: 기존 정책 전부 제거 (이름 무관)
-- ------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'buyer_profiles'
  loop
    execute format('drop policy if exists %I on public.buyer_profiles', pol.policyname);
  end loop;
end $$;

alter table buyer_profiles enable row level security;

-- 본인 소유 buyer_profiles는 select 가능
create policy buyer_profiles_select_own
  on buyer_profiles for select
  using (user_id = auth.uid());

-- 자신에게 견적요청을 보낸 소상공인의 buyer_profiles는 파트너가 select 가능
-- (공급업체 대시보드에서 business_name/region/industry 표시용)
create policy buyer_profiles_select_partner_target
  on buyer_profiles for select
  using (qd_is_buyer_visible_to_partner(id));

-- 소상공인 회원가입 시 본인 명의로 buyer_profiles row 최초 생성 허용
create policy buyer_profiles_insert_own
  on buyer_profiles for insert
  with check (user_id = auth.uid());
