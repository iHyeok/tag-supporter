// GET /api/images — list all images
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '500');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    const { results } = await env.DB.prepare(
      'SELECT id, filename, thumb_key, mime_type, file_size, created_at FROM images ORDER BY filename LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();

    const images = results.map((img) => ({
      id: img.id,
      filename: img.filename,
      thumbUrl: `/api/images/${img.id}/thumb`,
      mimeType: img.mime_type,
      fileSize: img.file_size,
      createdAt: img.created_at,
    }));

    return Response.json({ images, total: images.length });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
