CREATE TABLE IF NOT EXISTS user_discord_integrations (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  webhook_url TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  notify_on_loads BOOLEAN DEFAULT TRUE,
  notify_on_docs BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION touch_user_discord_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_user_discord_integrations ON user_discord_integrations;
CREATE TRIGGER trg_touch_user_discord_integrations
BEFORE UPDATE ON user_discord_integrations
FOR EACH ROW EXECUTE PROCEDURE touch_user_discord_integrations_updated_at();
