CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  filename   TEXT NOT NULL,
  r2_key     TEXT NOT NULL,
  thumb_key  TEXT,
  mime_type  TEXT,
  file_size  INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  image_id   TEXT REFERENCES images(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  position   INTEGER NOT NULL,
  PRIMARY KEY (image_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE INDEX IF NOT EXISTS idx_tags_image_id ON tags(image_id);
CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename);
