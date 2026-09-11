-- 1단계: 사주 프로필 테이블

CREATE TABLE saju_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_date DATE NOT NULL,
  birth_time TIME,
  is_lunar BOOLEAN NOT NULL DEFAULT false,
  gender TEXT CHECK (gender IN ('M', 'F')),
  year_pillar TEXT NOT NULL,
  month_pillar TEXT NOT NULL,
  day_pillar TEXT NOT NULL,
  hour_pillar TEXT,
  ohaeng_distribution JSONB NOT NULL,
  day_gan TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE saju_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY saju_profiles_select_own ON saju_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY saju_profiles_insert_own ON saju_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY saju_profiles_update_own ON saju_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION qd_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_saju_profiles_touch
  BEFORE UPDATE ON saju_profiles
  FOR EACH ROW EXECUTE FUNCTION qd_touch_updated_at();
