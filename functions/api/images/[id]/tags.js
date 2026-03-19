// GET /api/images/:id/tags — get tags for an image
// PUT /api/images/:id/tags — update all tags for an image
export async function onRequestGet(context) {
  const { env, params } = context;
  const imageId = params.id;

  try {
    const { results } = await env.DB.prepare(
      'SELECT tag FROM tags WHERE image_id = ? ORDER BY position'
    ).bind(imageId).all();

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

    // Delete existing tags
    await env.DB.prepare('DELETE FROM tags WHERE image_id = ?').bind(imageId).run();

    // Insert new tags with position
    if (tags.length > 0) {
      const stmts = tags.map((tag, index) =>
        env.DB.prepare(
          'INSERT INTO tags (image_id, tag, position) VALUES (?, ?, ?)'
        ).bind(imageId, tag.trim(), index)
      );
      await env.DB.batch(stmts);
    }

    return Response.json({ success: true, count: tags.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
