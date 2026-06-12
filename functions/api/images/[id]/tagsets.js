// GET  /api/images/:id/tagsets — list all tag sets (with tags) for an image
// POST /api/images/:id/tagsets — create a new tag set for an image

const PURPOSES = ['inference', 'train-style', 'train-char'];

// Lazily migrate legacy `tags` rows into a default tag set so older data
// keeps working without running /api/init.
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
    await ensureDefaultSet(env, imageId);

    const { results: sets } = await env.DB.prepare(
      'SELECT id, name, purpose, model, is_default, created_at FROM tag_sets WHERE image_id = ? ORDER BY is_default DESC, created_at'
    ).bind(imageId).all();

    const { results: tagRows } = await env.DB.prepare(
      `SELECT st.set_id AS set_id, st.tag AS tag, st.position AS position
       FROM set_tags st JOIN tag_sets ts ON ts.id = st.set_id
       WHERE ts.image_id = ? ORDER BY st.position`
    ).bind(imageId).all();

    const tagsBySet = {};
    for (const row of tagRows) {
      (tagsBySet[row.set_id] ||= []).push(row.tag);
    }

    return Response.json({
      sets: sets.map((s) => ({
        id: s.id,
        name: s.name,
        purpose: s.purpose,
        model: s.model,
        isDefault: !!s.is_default,
        createdAt: s.created_at,
        tags: tagsBySet[s.id] || [],
      })),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const imageId = params.id;

  try {
    const body = await request.json();
    const purpose = PURPOSES.includes(body.purpose) ? body.purpose : 'inference';
    const model = body.model || null;
    const name = (body.name || '').trim() || purpose;

    let tags = Array.isArray(body.tags) ? body.tags : [];
    if (body.copyFromSetId) {
      const { results } = await env.DB.prepare(
        'SELECT tag FROM set_tags WHERE set_id = ? ORDER BY position'
      ).bind(body.copyFromSetId).all();
      tags = results.map((r) => r.tag);
    }

    const existing = await env.DB.prepare(
      'SELECT COUNT(*) AS cnt FROM tag_sets WHERE image_id = ?'
    ).bind(imageId).first();
    const isDefault = existing.cnt === 0 ? 1 : 0;

    const setId = crypto.randomUUID();
    const stmts = [
      env.DB.prepare(
        'INSERT INTO tag_sets (id, image_id, name, purpose, model, is_default) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(setId, imageId, name, purpose, model, isDefault),
      ...tags.map((tag, i) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO set_tags (set_id, tag, position) VALUES (?, ?, ?)'
        ).bind(setId, String(tag).trim(), i)
      ),
    ];
    await env.DB.batch(stmts);

    return Response.json({
      set: { id: setId, name, purpose, model, isDefault: !!isDefault, tags },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
