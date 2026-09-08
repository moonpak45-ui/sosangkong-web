-- ============================================================
-- 중급 관리자(sub_admin) 권한 체계
-- 대상 테이블: users, categories
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전하도록
-- 작성됨 - add column if not exists, create or replace function,
-- drop policy if exists → create policy)
--
-- 배경) 지금까지 "관리자"는 users.role = 'admin' 하나로만 구분됐고
-- (qd_is_admin() 함수, 20260907050000 마이그레이션), role='admin'이면
-- 무조건 전체 기능(회원관리·거래견적관리·카테고리관리)에 접근 가능했음.
-- 이번에 super_admin/sub_admin 두 등급을 나눠서, sub_admin은 카테고리
-- 관리와 (신설 예정인) 관리자 계정 관리에는 접근하지 못하게 함.
--
-- 설계 노트:
-- 1) users.role 자체는 건드리지 않음 - 'buyer'/'partner'/'admin' 값을
--    그대로 유지하고(로그인 화면 등 기존 코드가 이 값에 의존), 새 컬럼
--    admin_role을 추가해서 "role='admin'인 행 중에서" super_admin인지
--    sub_admin인지만 구분함(role != 'admin'인 행은 admin_role이 항상 null).
-- 2) 기존 admin 계정(들)은 이번 마이그레이션에서 전부 super_admin으로
--    백필함 - "super_admin: 기존과 동일하게 전체 기능"이라는 요구사항과
--    일치, 기존 admin 계정이 하나라도 권한을 잃지 않도록 함.
-- 3) qd_is_admin()은 그대로 둠(role='admin'이면 true - 회원관리·거래견적
--    관리는 sub_admin도 가능해야 하므로 이 함수를 쓰는 기존 정책들은
--    안 건드림). qd_is_super_admin()을 새로 추가해서 카테고리 CRUD처럼
--    super_admin 전용인 곳에만 씀.
-- 4) users 테이블의 기존 "관리자는 전체 select/update 가능"
--    (qd_is_admin() 기반) 정책은 사실상 sub_admin도 다른 admin 행(다른
--    관리자 계정 정보)을 읽고 쓸 수 있게 허용하고 있었음 - "관리자 계정
--    관리는 RLS로도 차단"이라는 요구사항과 맞지 않아서, 이 정책을
--    "admin은 buyer/partner 행만" + "super_admin은 전체(관리자 행 포함)"
--    두 개로 쪼갬. sub_admin은 본인 행(users_select_own/본인 update)은
--    여전히 볼 수 있지만 다른 관리자 행은 select/update 둘 다 막힘.
-- ============================================================

-- ------------------------------------------------------------
-- 0. users.admin_role 컬럼 추가 + 기존 admin 백필
-- ------------------------------------------------------------
alter table users add column if not exists admin_role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_admin_role_check'
  ) then
    alter table users
      add constraint users_admin_role_check
      check (admin_role is null or admin_role in ('super_admin', 'sub_admin'));
  end if;
end $$;

-- 기존 admin 계정은 전부 super_admin으로 (한 번만 - 이미 값이 있으면 안 건드림)
update users set admin_role = 'super_admin' where role = 'admin' and admin_role is null;

-- ------------------------------------------------------------
-- 1. qd_is_super_admin() 헬퍼 함수 (qd_is_admin()과 동일 패턴 - users
--    테이블 하나만 조회, 순환참조 없음)
-- ------------------------------------------------------------
create or replace function qd_is_super_admin() returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'admin' and admin_role = 'super_admin'
  );
$$;

-- ------------------------------------------------------------
-- 2. users: "admin은 전체 select/update 가능" 정책을 쪼갬
--    (buyer/partner 행 vs 관리자 행 자신)
-- ------------------------------------------------------------
drop policy if exists users_select_admin_all on users;

drop policy if exists users_select_admin_members on users;
create policy users_select_admin_members
  on users for select
  using (qd_is_admin() and role in ('buyer', 'partner'));

drop policy if exists users_select_super_admin_all on users;
create policy users_select_super_admin_all
  on users for select
  using (qd_is_super_admin());

drop policy if exists users_update_admin on users;

drop policy if exists users_update_admin_members on users;
create policy users_update_admin_members
  on users for update
  using (qd_is_admin() and role in ('buyer', 'partner'))
  with check (role in ('buyer', 'partner'));

drop policy if exists users_update_super_admin_all on users;
create policy users_update_super_admin_all
  on users for update
  using (qd_is_super_admin())
  with check (true);

-- [신설] 관리자 계정 생성용 - super_admin이 새 관리자 계정의 users 행을
-- insert할 수 있어야 함(회원가입은 본인 행만 insert 가능한 게 기존 정책
-- users_insert_own이라 다른 사람 id로는 insert 불가 - service role key가
-- 없어서 관리자 계정 생성도 클라이언트에서 signUp()으로 처리하는데, 그
-- 직후 세션이 새로 만든 계정으로 바뀌어 있으면 users_insert_own으로
-- 이미 가능하지만, 프로젝트 설정상 이메일 확인이 필요해서 세션이 안 바뀌는
-- 경우까지 대비해 이 정책도 추가함).
drop policy if exists users_insert_super_admin on users;
create policy users_insert_super_admin
  on users for insert
  with check (qd_is_super_admin());

-- ------------------------------------------------------------
-- 3. categories: insert/update/delete를 qd_is_admin() → qd_is_super_admin()
--    으로 좁힘 (select는 공개 정책 그대로 유지 - 카테고리 자체는 여전히
--    /search, /quote-request 등에서 누구나 조회 가능해야 함)
-- ------------------------------------------------------------
drop policy if exists categories_insert_admin on categories;
create policy categories_insert_admin
  on categories for insert
  with check (qd_is_super_admin());

drop policy if exists categories_update_admin on categories;
create policy categories_update_admin
  on categories for update
  using (qd_is_super_admin())
  with check (qd_is_super_admin());

drop policy if exists categories_delete_admin on categories;
create policy categories_delete_admin
  on categories for delete
  using (qd_is_super_admin());
