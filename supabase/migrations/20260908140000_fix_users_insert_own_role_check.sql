-- ============================================================
-- users_insert_own 정책에 role 값 검증 추가 (보안 구멍 수정)
-- 대상 테이블: users
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전 -
-- drop policy if exists → create policy)
--
-- 배경) 20260907050000에서 만든 users_insert_own 정책은
-- `with check (id = auth.uid())`만 검사해서, 회원가입 시 자기 자신의
-- users 행을 insert할 수 있다는 것만 확인하고 role 컬럼 값 자체는 전혀
-- 검증하지 않았음. 즉 이론적으로는 회원가입 API 호출을 그대로 흉내 내면서
-- role: 'admin'을 보내는 것도 RLS가 막지 못하는 구멍이었음(20260908130000
-- 작업 중 발견, HANDOFF.md에 기록만 해두고 그때는 손대지 않음).
--
-- 조치) 이 정책에 `and role in ('buyer', 'partner')` 조건을 추가함 -
-- 회원가입(app/login/page.tsx의 handleSignup)은 항상 role을 'buyer' 또는
-- 'partner'로만 보내므로 정상 가입 플로우는 그대로 동작하고, role:'admin'
-- (또는 그 외 값)을 보내는 insert는 이제 RLS 위반으로 거부됨.
-- 관리자 계정 생성은 이 정책과 무관하게 별도 정책
-- (users_insert_super_admin, 20260908130000)으로 처리되므로 영향 없음.
-- ============================================================

drop policy if exists users_insert_own on users;
create policy users_insert_own
  on users for insert
  with check (id = auth.uid() and role in ('buyer', 'partner'));
