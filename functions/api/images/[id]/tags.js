// GET /api/images/:id/tags — get tags of the image's default tag set (backward compat)
// PUT /api/images/:id/tags — replace tags of the image's default tag set (backward compat)

// Lazily migrate legacy `tags` rows into a default tag set.
async function ensureDefaultSet(env, imageId) {
  const def = await env.DB.prepare(
    'SELECT id FROM tag_sets WHERE image_id = ? AND is_default = 1'
  ).bind(imageId).first();
  if (def) return def.id;

  const any = await env.DB.prepare(
    'SELECT id FROM tag_sets WHERE image_id = ? ORDER BY created_at LIMIT 1'
  ).bind(imageId).first();
  if (any) {
    await env.DB.prepare('UPDATE tag_sets SET is_default = 1 WHERE id = ?').bind(any.id).run();
    return any.id;
  }

  const setId = crypto.randomUUID();
  const { results: legacyTags } = await env.DB.prepare(
    'SELECT tag, position FROM tags WHERE image_id = ? ORDER BY position'
  ).bind(imageId).all();

  const stmts = [
    env.DB.prepare(
      `INSERT INTO tag_sets (id, image_id, name, purpose, model, is_default) VALUES (?, ?, 'main', 'inference', NULL, 1)`
    ).bind(setId, imageId),
    ...legacyTags.map((t) =>
      env.DB.prepare(
        'INSERT OR IGNORE INTO set_tags (set_id, tag, position) VALUES (?, ?, ?)'
      ).bind(setId, t.tag, t.position)
    ),
  ];
  if (legacyTags.length > 0) {
    stmts.push(env.DB.prepare('DELETE FROM tags WHERE image_id = ?').bind(imageId));
  }
  await env.DB.batch(stmts);
  return setId;
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const imageId = params.id;

  try {
    const setId = await ensureDefaultSet(env, imageId);
    const { results } = await env.DB.prepare(
      'SELECT tag FROM set_tags WHERE set_id = ? ORDER BY position'
    ).bind(setId).all();

    return Response.json({ tags: results.map((r) => r.tag) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const { env, params, request } = context;
  const imageId = params.id;

  try {
    const body = await request.json();
    const tags = body.tags;

    if (!Array.isArray(tags)) {
      return Response.json({ error: 'tags must be an array' }, { status: 400 });
    }

    const setId = await ensureDefaultSet(env, imageId);

    const stmts = [
      env.DB.prepare('DELETE FROM set_tags WHERE set_id = ?').bind(setId),
      ...tags.map((tag, index) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO set_tags (set_id, tag, position) VALUES (?, ?, ?)'
        ).bind(setId, String(tag).trim(), index)
      ),
    ];
    await env.DB.batch(stmts);

    return Response.json({ success: true, count: tags.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
