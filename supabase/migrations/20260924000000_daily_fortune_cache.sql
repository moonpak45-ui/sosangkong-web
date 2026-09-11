-- 3단계: 일자별 운세 카드 캐시 (사용자당 하루 1회 고정)

CREATE TABLE daily_fortune_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fortune_date DATE NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('생','극','합','충','비화')),
  cards JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fortune_date)
);

ALTER TABLE daily_fortune_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_fortune_cache_select_own ON daily_fortune_cache
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY daily_fortune_cache_insert_own ON daily_fortune_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY daily_fortune_cache_update_own ON daily_fortune_cache
  FOR UPDATE USING (auth.uid() = user_id);
