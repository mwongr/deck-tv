export const schema = `
  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS playlist_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'M3U', 'XTREAM'
    url TEXT,
    xmltv_url TEXT,
    server TEXT,
    username TEXT,
    password TEXT,
    last_sync DATETIME,
    channel_count INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS epg_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    last_sync DATETIME,
    program_count INTEGER DEFAULT 0,
    refresh_interval INTEGER DEFAULT 24, -- hours
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    channel_count INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    favorite BOOLEAN DEFAULT 0,
    favorite_order INTEGER DEFAULT 0,
    favorited_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL, -- Link to playlist_sources.id
    name TEXT NOT NULL,
    logo TEXT,
    url TEXT NOT NULL,
    group_id TEXT NOT NULL,
    group_name TEXT,
    tvg_id TEXT,
    tvg_name TEXT,
    catchup_supported BOOLEAN DEFAULT 0,
    catchup_days INTEGER,
    catchup_source TEXT,
    sort_order INTEGER DEFAULT 0,
    favorite BOOLEAN DEFAULT 0,
    favorite_order INTEGER DEFAULT 0,
    favorited_at DATETIME,
    rating REAL,
    FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY(source_id) REFERENCES playlist_sources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS epg_programs (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL, -- Link to epg_sources.id
    channel_tvg_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start DATETIME NOT NULL,
    end DATETIME NOT NULL,
    icon TEXT,
    category TEXT,
    FOREIGN KEY(source_id) REFERENCES epg_sources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'live', 'movie', 'series'
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS custom_group_items (
    id TEXT PRIMARY KEY,
    custom_group_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    tvg_id TEXT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(custom_group_id) REFERENCES custom_groups(id) ON DELETE CASCADE,
    FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_channels_group ON channels(group_id);
  CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source_id);
  CREATE INDEX IF NOT EXISTS idx_epg_channel_time ON epg_programs(channel_tvg_id, start);
  CREATE INDEX IF NOT EXISTS idx_epg_source ON epg_programs(source_id);
  CREATE INDEX IF NOT EXISTS idx_custom_group_items ON custom_group_items(custom_group_id);
`;
