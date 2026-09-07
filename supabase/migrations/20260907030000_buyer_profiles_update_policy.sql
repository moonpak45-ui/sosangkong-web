-- ============================================================
-- buyer_profiles UPDATE 정책 추가
-- 대상 테이블: buyer_profiles
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요.
--
-- 배경) 마이페이지 "사업장 정보 수정" 화면에서 로그인한 소상공인이 본인의
-- buyer_profiles 행을 update할 수 있어야 합니다. 그런데 20260907010000
-- 마이그레이션에서 buyer_profiles에 걸려 있던 기존 정책을 이름과 무관하게
-- 전부 제거하고 select_own / select_partner_target / insert_own 세 개만
-- 다시 만들었기 때문에, 현재 buyer_profiles에는 update를 허용하는 정책이
-- 없습니다. (RLS가 켜진 테이블에서 update를 허용하는 정책이 없으면 update는
-- 에러 없이 0 rows affected로 조용히 실패합니다.)
--
-- 이 마이그레이션은 본인 소유 행만 수정할 수 있는 update 정책을 추가합니다.
-- ============================================================

drop policy if exists buyer_profiles_update_own on buyer_profiles;

create policy buyer_profiles_update_own
  on buyer_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
