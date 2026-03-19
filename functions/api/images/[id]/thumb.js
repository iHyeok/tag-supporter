// GET /api/images/:id/thumb — serve thumbnail image
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;

  try {
    const image = await env.DB.prepare(
      'SELECT thumb_key, r2_key, mime_type FROM images WHERE id = ?'
    ).bind(id).first();

    if (!image) {
      return new Response('Not found', { status: 404 });
    }

    // Try thumbnail first, fall back to original
    const key = image.thumb_key || image.r2_key;
    const obj = await env.BUCKET.get(key);

    if (!obj) {
      return new Response('Not found', { status: 404 });
    }

    const contentType = image.thumb_key ? 'image/webp' : (image.mime_type || 'image/png');
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(obj.body, { headers });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
