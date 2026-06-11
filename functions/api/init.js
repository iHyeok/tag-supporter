// POST /api/init — Initialize database schema + migrate legacy tags into tag sets
export async function onRequestPost(context) {
  const { env } = context;

  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, filename TEXT NOT NULL, r2_key TEXT NOT NULL, thumb_key TEXT, mime_type TEXT, file_size INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

    await env.DB.exec(`CREATE TABLE IF NOT EXISTS tags (image_id TEXT REFERENCES images(id) ON DELETE CASCADE, tag TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (image_id, tag))`);

    await env.DB.exec(`CREATE TABLE IF NOT EXISTS tag_sets (id TEXT PRIMARY KEY, image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE, name TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'inference', model TEXT, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

    await env.DB.exec(`CREATE TABLE IF NOT EXISTS set_tags (set_id TEXT NOT NULL REFERENCES tag_sets(id) ON DELETE CASCADE, tag TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (set_id, tag))`);

    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag)');
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_tags_image_id ON tags(image_id)');
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename)');
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_tag_sets_image ON tag_sets(image_id)');
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_tag_sets_purpose ON tag_sets(purpose)');
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_set_tags_tag ON set_tags(tag)');
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_set_tags_set ON set_tags(set_id)');

    // Migrate legacy per-image tags into a default tag set (one-time per image)
    const { results: legacyImages } = await env.DB.prepare(
      `SELECT DISTINCT t.image_id AS image_id FROM tags t
       WHERE NOT EXISTS (SELECT 1 FROM tag_sets ts WHERE ts.image_id = t.image_id)`
    ).all();

    let migrated = 0;
    for (const row of legacyImages) {
      const setId = crypto.randomUUID();
      const { results: legacyTags } = await env.DB.prepare(
        'SELECT tag, position FROM tags WHERE image_id = ? ORDER BY position'
      ).bind(row.image_id).all();

      const stmts = [
        env.DB.prepare(
          `INSERT INTO tag_sets (id, image_id, name, purpose, model, is_default) VALUES (?, ?, 'main', 'inference', NULL, 1)`
        ).bind(setId, row.image_id),
        ...legacyTags.map((t) =>
          env.DB.prepare(
            'INSERT OR IGNORE INTO set_tags (set_id, tag, position) VALUES (?, ?, ?)'
          ).bind(setId, t.tag, t.position)
        ),
        env.DB.prepare('DELETE FROM tags WHERE image_id = ?').bind(row.image_id),
      ];
      await env.DB.batch(stmts);
      migrated++;
    }

    return Response.json({ success: true, message: 'Schema initialized', migratedImages: migrated });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
