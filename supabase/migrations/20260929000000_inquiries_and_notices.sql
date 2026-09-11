-- =====================================================================
-- 20260929000000_inquiries_and_notices.sql
--
-- 목적: 푸터 "문의하기"(1:1 문의) / "공지사항"(공지 게시판) 기능 신설
--
-- 적용 전 확인: qd_is_admin() 함수는 20260907050000_admin_role_rls.sql에서
-- 이미 정의되어 있음을 확인함(그대로 재사용).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) inquiries (1:1 문의)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- 비로그인 문의 허용 위해 nullable
  name text NOT NULL,
  contact text NOT NULL, -- 이메일 또는 전화번호
  category text NOT NULL DEFAULT '기타' CHECK (category IN ('이용문의','거래문의','수수료문의','기술오류','기타')),
  title text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered')),
  answer text,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- 누구나(비로그인 포함) 문의 등록 가능
DROP POLICY IF EXISTS inquiries_insert_anyone ON inquiries;
CREATE POLICY inquiries_insert_anyone ON inquiries
  FOR INSERT
  WITH CHECK (true);

-- 본인이 로그인해서 남긴 문의는 본인만 조회 가능
DROP POLICY IF EXISTS inquiries_select_own ON inquiries;
CREATE POLICY inquiries_select_own ON inquiries
  FOR SELECT
  USING (auth.uid() = user_id);

-- 관리자는 전체 조회/수정(답변 작성) 가능
DROP POLICY IF EXISTS inquiries_admin_all ON inquiries;
CREATE POLICY inquiries_admin_all ON inquiries
  FOR ALL
  USING (qd_is_admin())
  WITH CHECK (qd_is_admin());

COMMENT ON TABLE inquiries IS '1:1 문의. 비로그인도 등록 가능(user_id null), 답변은 관리자만 작성';


-- ---------------------------------------------------------------------
-- 2) notices (공지사항)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false, -- 상단 고정
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- 게시된 공지는 누구나(비로그인 포함) 조회 가능
DROP POLICY IF EXISTS notices_select_published ON notices;
CREATE POLICY notices_select_published ON notices
  FOR SELECT
  USING (is_published = true);

-- 관리자는 작성/수정/삭제 및 미게시 공지도 전체 조회 가능
DROP POLICY IF EXISTS notices_admin_all ON notices;
CREATE POLICY notices_admin_all ON notices
  FOR ALL
  USING (qd_is_admin())
  WITH CHECK (qd_is_admin());

COMMENT ON TABLE notices IS '공지사항 게시판. is_pinned=true는 목록 최상단 고정, is_published=false는 임시저장(비공개)';

CREATE INDEX IF NOT EXISTS idx_notices_pinned_created ON notices (is_pinned DESC, created_at DESC);
