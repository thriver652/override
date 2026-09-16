-- Run once:  npx wrangler d1 execute override-db --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,            -- unix ms
  day TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  type TEXT NOT NULL,             -- run_start | run_end | reboot | share | error
  sid TEXT,                       -- per-page-load session id
  portal TEXT,                    -- none | crazygames | poki
  daily INTEGER DEFAULT 0,
  nodes INTEGER,
  score INTEGER,
  rebooted INTEGER DEFAULT 0,
  msg TEXT                        -- error message (trimmed)
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
CREATE INDEX IF NOT EXISTS idx_events_type_day ON events(type, day);
