// GET /api/images/:id — serve image binary from R2
// DELETE /api/images/:id — delete image
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  try {
    const image = await env.DB.prepare(
      'SELECT r2_key, mime_type FROM images WHERE id = ?'
    ).bind(id).first();

    if (!image) {
      return Response.json({ error: 'Image not found' }, { status: 404 });
    }

    // Serve the actual image from R2
    const obj = await env.BUCKET.get(image.r2_key);
    if (!obj) {
      return Response.json(
        { error: 'Image file not found in storage', r2_key: image.r2_key },
        { status: 404 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', image.mime_type || 'image/png');
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(obj.body, { headers });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

async function handleThumb(env, id) {
  const image = await env.DB.prepare(
    'SELECT thumb_key, mime_type FROM images WHERE id = ?'
  ).bind(id).first();

  if (!image || !image.thumb_key) {
    return new Response('Not found', { status: 404 });
  }

  const obj = await env.BUCKET.get(image.thumb_key);
  if (!obj) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'image/webp');
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;

  try {
    const image = await env.DB.prepare(
      'SELECT r2_key, thumb_key FROM images WHERE id = ?'
    ).bind(id).first();

    if (!image) {
      return Response.json({ error: 'Image not found' }, { status: 404 });
    }

    // Delete from R2
    await env.BUCKET.delete(image.r2_key);
    if (image.thumb_key) {
      await env.BUCKET.delete(image.thumb_key);
    }

    // Delete from DB (CASCADE will remove tags)
    await env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
