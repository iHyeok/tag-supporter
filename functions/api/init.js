// POST /api/init — Initialize database schema (dev only)
export async function onRequestPost(context) {
  const { env } = context;

  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, filename TEXT NOT NULL, r2_key TEXT NOT NULL, thumb_key TEXT, mime_type TEXT, file_size INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

    await env.DB.exec(`CREATE TABLE IF NOT EXISTS tags (image_id TEXT REFERENCES images(id) ON DELETE CASCADE, tag TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (image_id, tag))`);

    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag)');
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_tags_image_id ON tags(image_id)');
    await env.DB.exec('CREATE INDEX IF NOT EXISTS idx_images_filename ON images(filename)');

    return Response.json({ success: true, message: 'Schema initialized' });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
