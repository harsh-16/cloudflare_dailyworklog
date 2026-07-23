CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  key_label TEXT NOT NULL DEFAULT '',
  key_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  expires_on TEXT,
  last_used TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_profile ON api_keys(profile_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT 'Other',
  type TEXT NOT NULL DEFAULT 'Technical',
  area TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  important INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 10000,
  notes TEXT NOT NULL DEFAULT '',
  todo_items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_topics_owner ON topics(owner_id);
CREATE INDEX IF NOT EXISTS idx_topics_owner_name ON topics(owner_id, name);
CREATE INDEX IF NOT EXISTS idx_topics_owner_priority ON topics(owner_id, active, priority, important);

CREATE TABLE IF NOT EXISTS updates (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  update_date TEXT NOT NULL,
  focus TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'on_track',
  type TEXT NOT NULL DEFAULT 'Technical',
  progress TEXT NOT NULL DEFAULT '',
  blockers TEXT NOT NULL DEFAULT '',
  next_step TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL DEFAULT 70,
  tags TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES profiles(id),
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);

CREATE INDEX IF NOT EXISTS idx_updates_owner_date ON updates(owner_id, update_date);
CREATE INDEX IF NOT EXISTS idx_updates_topic_date ON updates(topic_id, update_date);
CREATE INDEX IF NOT EXISTS idx_updates_owner_topic_date ON updates(owner_id, topic_id, update_date);
