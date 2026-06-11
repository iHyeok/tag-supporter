// GET    /api/tagsets/:id — get a single tag set with tags
// PUT    /api/tagsets/:id — update tag set meta and/or replace tags
// DELETE /api/tagsets/:id — delete a tag set

const PURPOSES = ['inference', 'train-style', 'train-char'];

export async function onRequestGet(context) {
  const { env, params } = context;

  try {
    const set = await env.DB.prepare(
      'SELECT id, image_id, name, purpose, model, is_default, created_at FROM tag_sets WHERE id = ?'
    ).bind(params.id).first();

    if (!set) {
      return Response.json({ error: 'Tag set not found' }, { status: 404 });
    }

    const { results } = await env.DB.prepare(
      'SELECT tag FROM set_tags WHERE set_id = ? ORDER BY position'
    ).bind(params.id).all();

    return Response.json({
      set: {
        id: set.id,
        imageId: set.image_id,
        name: set.name,
        purpose: set.purpose,
        model: set.model,
        isDefault: !!set.is_default,
        createdAt: set.created_at,
        tags: results.map((r) => r.tag),
      },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  const { env, params, request } = context;
  const setId = params.id;

  try {
    const set = await env.DB.prepare(
      'SELECT id FROM tag_sets WHERE id = ?'
    ).bind(setId).first();
    if (!set) {
      return Response.json({ error: 'Tag set not found' }, { status: 404 });
    }

    const body = await request.json();
    const stmts = [];

    if (typeof body.name === 'string' && body.name.trim()) {
      stmts.push(env.DB.prepare('UPDATE tag_sets SET name = ? WHERE id = ?').bind(body.name.trim(), setId));
    }
    if (PURPOSES.includes(body.purpose)) {
      stmts.push(env.DB.prepare('UPDATE tag_sets SET purpose = ? WHERE id = ?').bind(body.purpose, setId));
    }
    if ('model' in body) {
      stmts.push(env.DB.prepare('UPDATE tag_sets SET model = ? WHERE id = ?').bind(body.model || null, setId));
    }
    if (Array.isArray(body.tags)) {
      stmts.push(env.DB.prepare('DELETE FROM set_tags WHERE set_id = ?').bind(setId));
      body.tags.forEach((tag, i) => {
        stmts.push(
          env.DB.prepare(
            'INSERT OR IGNORE INTO set_tags (set_id, tag, position) VALUES (?, ?, ?)'
          ).bind(setId, String(tag).trim(), i)
        );
      });
    }

    if (stmts.length > 0) await env.DB.batch(stmts);

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const setId = params.id;

  try {
    const set = await env.DB.prepare(
      'SELECT id, image_id, is_default FROM tag_sets WHERE id = ?'
    ).bind(setId).first();
    if (!set) {
      return Response.json({ error: 'Tag set not found' }, { status: 404 });
    }

    await env.DB.batch([
      env.DB.prepare('DELETE FROM set_tags WHERE set_id = ?').bind(setId),
      env.DB.prepare('DELETE FROM tag_sets WHERE id = ?').bind(setId),
    ]);

    // Promote the oldest remaining set to default if we removed the default
    if (set.is_default) {
      const next = await env.DB.prepare(
        'SELECT id FROM tag_sets WHERE image_id = ? ORDER BY created_at LIMIT 1'
      ).bind(set.image_id).first();
      if (next) {
        await env.DB.prepare('UPDATE tag_sets SET is_default = 1 WHERE id = ?').bind(next.id).run();
      }
    }

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
