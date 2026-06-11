CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  filename   TEXT NOT NULL UNIQUE,
  r2_key     TEXT NOT NULL,
  thumb_key  TEXT,
  mime_type  TEXT,
  file_size  INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Legacy single tag list per image (kept for backward compat / migration).
-- New data lives in tag_sets + set_tags. Rows here are moved into a default
-- tag set the first time an image is opened (lazy migration) or via POST /api/init.
CREATE TABLE IF NOT EXISTS tags (
  image_id   TEXT REFERENCES images(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  position   INTEGER NOT NULL,
  PRIMARY KEY (image_id, tag)
);

-- 1:N tag sets per image.
-- purpose: 'inference' (프롬프트 생성용) | 'train-style' (스타일 학습) | 'train-char' (캐릭터 학습)
-- model:   'anima' | 'sdxl' | 'ltx' | 'wan' | 'grok' | 'gpt-image' | NULL (모델 공용)
CREATE TABLE IF NOT EXISTS tag_sets (
  id         TEXT PRIMARY KEY,
  image_id   TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT 'inference',
  model      TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS set_tags (
  set_id     TEXT NOT NULL REFERENCES tag_sets(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  position   INTEGER NOT NULL,
  PRIMARY KEY (set_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE INDEX IF NOT EXISTS idx_tags_image_id ON tags(image_id);
CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename);
CREATE INDEX IF NOT EXISTS idx_tag_sets_image ON tag_sets(image_id);
CREATE INDEX IF NOT EXISTS idx_tag_sets_purpose ON tag_sets(purpose);
CREATE INDEX IF NOT EXISTS idx_set_tags_tag ON set_tags(tag);
CREATE INDEX IF NOT EXISTS idx_set_tags_set ON set_tags(set_id);
