-- ============================================================
-- 관리자(admin) 권한 기반 마련
-- 대상 테이블: users, buyer_profiles, partners, partner_documents,
--             quote_requests, quote_request_targets, quotes, deals,
--             disputes, settlements, categories, category_attribute_defs,
--             category_document_requirements
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 함수는 create or replace, 정책은 drop → create 로 작성되어 있습니다.)
--
-- 중요한 전제/설계 노트 — 실행 전에 꼭 읽어주세요)
--
-- 1) qd_is_admin()은 users 테이블 "하나만" 조회합니다 (다른 테이블을 다시
--    참조하지 않음 → 20260907010000에서 겪었던 RLS 순환 재귀 문제와 무관).
--
-- 2) users, categories, category_attribute_defs, category_document_requirements,
--    partner_documents, disputes 테이블은 지금까지 RLS가 "꺼져" 있어서
--    (20260907000000 마이그레이션 주석 참고) admin 정책만 추가해서는 아무
--    효과가 없습니다(Postgres는 RLS가 꺼진 테이블에서는 정책 자체를 평가하지
--    않습니다). 그래서 이 마이그레이션은 이 테이블들에 대해 RLS를 "켜는"
--    작업도 함께 합니다. 그 결과 기존 동작이 깨지지 않도록 아래 조치를
--    같이 넣었습니다:
--
--    - users: Header.tsx가 로그인한 본인의 role을 조회하고(select),
--      회원가입 시 본인 행을 insert합니다. 이 두 동작이 계속 되도록
--      "본인 행 select/insert" 정책을 admin 정책과 함께 추가합니다.
--      (참고: RLS가 꺼져 있던 지금까지는 사실 아무나 users 테이블의 아무
--      행이나 자유롭게 읽고 쓸 수 있었습니다 — 이 마이그레이션은 그 구멍도
--      함께 막습니다.)
--
--    - categories: /search, /quote-request 등에서 로그인 여부와 무관하게
--      카테고리 목록을 읽습니다. 이 공개 조회가 계속 되도록 "누구나 select"
--      정책을 admin CRUD 정책과 함께 추가합니다.
--
--    - category_attribute_defs, category_document_requirements,
--      partner_documents, disputes: 지금 리포 코드에서 이 테이블들을 읽는
--      기존 화면이 없으므로, admin 전용 select 정책만 추가해도 기존 기능이
--      깨지지 않습니다.
--
-- 3) partners.status / users.status "관리자는 update 가능" 정책은 테이블
--    단위 update 정책입니다. RLS는 "이 행을 update할 수 있는가"만 제어할
--    뿐 "이 컬럼만 바꿀 수 있는가"는 컬럼 단위로 제한하지 못합니다. 즉
--    이 정책이 있으면 관리자는 status 외 다른 컬럼도 기술적으로 수정할 수
--    있습니다(관리자를 신뢰하는 일반적인 관리자 콘솔 설계 전제).
--
-- 4) 전제 컬럼) users(id, email, role, status), partner_documents(...),
--    disputes(...), category_attribute_defs(...),
--    category_document_requirements(...) 테이블/컬럼은 이미 Supabase에
--    존재한다고 가정합니다. 리포에 이 테이블들의 CREATE TABLE 구문이 없어
--    실제 컬럼명이 다르면 이 SQL이 에러가 날 수 있습니다.
-- ============================================================

-- ------------------------------------------------------------
-- 0. 관리자 확인 헬퍼 함수 (users 테이블만 조회 — 순환참조 방지)
-- ------------------------------------------------------------
create or replace function qd_is_admin() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'admin'
  );
$$;

-- ------------------------------------------------------------
-- 1. users
-- ------------------------------------------------------------
alter table users enable row level security;

-- [기존 동작 유지용] 로그인한 본인 행 select (Header.tsx의 role 조회)
drop policy if exists users_select_own on users;
create policy users_select_own
  on users for select
  using (id = auth.uid());

-- [기존 동작 유지용] 회원가입 시 본인 행 insert (app/login/page.tsx)
drop policy if exists users_insert_own on users;
create policy users_insert_own
  on users for insert
  with check (id = auth.uid());

-- [요청하신 정책] 관리자는 전체 회원 select 가능
drop policy if exists users_select_admin_all on users;
create policy users_select_admin_all
  on users for select
  using (qd_is_admin());

-- [요청하신 정책] 관리자는 update 가능 (주로 status 변경 용도)
drop policy if exists users_update_admin on users;
create policy users_update_admin
  on users for update
  using (qd_is_admin())
  with check (qd_is_admin());

-- ------------------------------------------------------------
-- 2. buyer_profiles (RLS는 20260907010000에서 이미 켜져 있음)
-- ------------------------------------------------------------
drop policy if exists buyer_profiles_select_admin_all on buyer_profiles;
create policy buyer_profiles_select_admin_all
  on buyer_profiles for select
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 3. partners (RLS는 20260907000000에서 이미 켜져 있음)
-- ------------------------------------------------------------
drop policy if exists partners_select_admin_all on partners;
create policy partners_select_admin_all
  on partners for select
  using (qd_is_admin());

-- [요청하신 정책] 관리자는 update 가능 (승인/정지 등 status 변경 용도).
-- partners 테이블은 지금까지 update 정책이 전혀 없었으므로(본인조차 자기
-- partners 행을 update할 수 없었음), 이것이 partners의 첫 update 정책입니다.
drop policy if exists partners_update_admin on partners;
create policy partners_update_admin
  on partners for update
  using (qd_is_admin())
  with check (qd_is_admin());

-- ------------------------------------------------------------
-- 4. partner_documents (지금까지 RLS 꺼져 있었고, 이를 읽는 기존 화면 없음)
-- ------------------------------------------------------------
alter table partner_documents enable row level security;

drop policy if exists partner_documents_select_admin_all on partner_documents;
create policy partner_documents_select_admin_all
  on partner_documents for select
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 5. quote_requests (RLS는 20260907000000에서 이미 켜져 있음)
-- ------------------------------------------------------------
drop policy if exists quote_requests_select_admin_all on quote_requests;
create policy quote_requests_select_admin_all
  on quote_requests for select
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 6. quote_request_targets (RLS는 20260907000000에서 이미 켜져 있음)
-- ------------------------------------------------------------
drop policy if exists qrt_select_admin_all on quote_request_targets;
create policy qrt_select_admin_all
  on quote_request_targets for select
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 7. quotes (RLS는 20260907000000에서 이미 켜져 있음)
-- ------------------------------------------------------------
drop policy if exists quotes_select_admin_all on quotes;
create policy quotes_select_admin_all
  on quotes for select
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 8. deals (RLS는 20260907000000에서 이미 켜져 있음)
-- ------------------------------------------------------------
drop policy if exists deals_select_admin_all on deals;
create policy deals_select_admin_all
  on deals for select
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 9. disputes (지금까지 RLS 꺼져 있었고, 이를 읽는 기존 화면 없음)
-- ------------------------------------------------------------
alter table disputes enable row level security;

drop policy if exists disputes_select_admin_all on disputes;
create policy disputes_select_admin_all
  on disputes for select
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 10. settlements (RLS는 20260907040000에서 이미 켜져 있음)
-- ------------------------------------------------------------
drop policy if exists settlements_select_admin_all on settlements;
create policy settlements_select_admin_all
  on settlements for select
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 11. categories (지금까지 RLS 꺼져 있었지만 /search, /quote-request 등에서
-- 로그인 여부와 무관하게 공개 조회함 — 그 동작을 유지하는 공개 select
-- 정책을 admin CRUD 정책과 함께 추가)
-- ------------------------------------------------------------
alter table categories enable row level security;

-- [기존 동작 유지용] 카테고리는 공개 정보이므로 누구나 select 가능
drop policy if exists categories_select_public on categories;
create policy categories_select_public
  on categories for select
  using (true);

-- [요청하신 정책] 관리자는 insert/update/delete 가능
drop policy if exists categories_insert_admin on categories;
create policy categories_insert_admin
  on categories for insert
  with check (qd_is_admin());

drop policy if exists categories_update_admin on categories;
create policy categories_update_admin
  on categories for update
  using (qd_is_admin())
  with check (qd_is_admin());

drop policy if exists categories_delete_admin on categories;
create policy categories_delete_admin
  on categories for delete
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 12. category_attribute_defs (지금까지 RLS 꺼져 있었고, 이를 읽는 기존
-- 화면 없음 → 공개 select 정책 없이 admin 전용으로 잠급니다)
-- ------------------------------------------------------------
alter table category_attribute_defs enable row level security;

drop policy if exists category_attribute_defs_select_admin_all on category_attribute_defs;
create policy category_attribute_defs_select_admin_all
  on category_attribute_defs for select
  using (qd_is_admin());

drop policy if exists category_attribute_defs_insert_admin on category_attribute_defs;
create policy category_attribute_defs_insert_admin
  on category_attribute_defs for insert
  with check (qd_is_admin());

drop policy if exists category_attribute_defs_update_admin on category_attribute_defs;
create policy category_attribute_defs_update_admin
  on category_attribute_defs for update
  using (qd_is_admin())
  with check (qd_is_admin());

drop policy if exists category_attribute_defs_delete_admin on category_attribute_defs;
create policy category_attribute_defs_delete_admin
  on category_attribute_defs for delete
  using (qd_is_admin());

-- ------------------------------------------------------------
-- 13. category_document_requirements (지금까지 RLS 꺼져 있었고, 이를 읽는
-- 기존 화면 없음 → admin 전용 select만 추가)
-- ------------------------------------------------------------
alter table category_document_requirements enable row level security;

drop policy if exists category_document_requirements_select_admin_all on category_document_requirements;
create policy category_document_requirements_select_admin_all
  on category_document_requirements for select
  using (qd_is_admin());
