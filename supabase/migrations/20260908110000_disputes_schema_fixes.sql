-- ============================================================
-- disputes 스키마 보정 (20260908100000의 후속)
-- 대상 테이블: disputes
-- Supabase SQL Editor에 그대로 붙여넣어 실행하세요. (재실행해도 안전)
--
-- 배경) 20260908100000_admin_dispute_resolution.sql을 작성할 때 참고한
-- app/admin/deals/page.tsx의 disputes select(`id, status, reason,
-- created_at, ...`)가 실제 라이브 스키마와 다르다는 게 실제 테스트
-- 데이터를 넣어보는 과정에서 드러났습니다:
--
--   - `reason` 컬럼은 없고 `description` 컬럼이 실제 사유 필드입니다.
--   - `created_at` 컬럼 자체가 없습니다(접수일을 표시할 방법이 없었음).
--   - `status`는 자유 텍스트가 아니라 dispute_status ENUM이고, 실제 허용
--     값은 received / reviewing / resolved 세 가지뿐입니다. "반려"에
--     해당하는 값이 없어서 이 마이그레이션에서 rejected를 추가합니다.
--   - reporter_id(신고자, not null), type(분쟁 유형, not null 텍스트)도
--     기존 코드가 모르고 있던 not null 컬럼입니다. 이번 기능(상태 변경)
--     자체에는 영향 없지만 참고차 기록합니다.
--   - delete 정책이 없어 관리자도 행을 지울 수 없었습니다(테스트 데이터
--     정리를 위해 추가).
-- ============================================================

-- ------------------------------------------------------------
-- 1. 접수일 컬럼 추가
-- ------------------------------------------------------------
alter table disputes add column if not exists created_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 2. dispute_status ENUM에 반려(rejected) 값 추가
-- ------------------------------------------------------------
alter type dispute_status add value if not exists 'rejected';

-- ------------------------------------------------------------
-- 3. 관리자 delete 정책 (테스트/오등록 데이터 정리용)
-- ------------------------------------------------------------
drop policy if exists disputes_delete_admin on disputes;
create policy disputes_delete_admin
  on disputes for delete
  using (qd_is_admin());
