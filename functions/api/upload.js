// POST /api/upload — upload image to R2 + register in D1
export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const filename = file.name;
    const id = crypto.randomUUID();
    const r2Key = `originals/${filename}`;
    const mimeType = file.type || 'image/png';
    const arrayBuffer = await file.arrayBuffer();
    const fileSize = arrayBuffer.byteLength;

    // Upload original to R2
    await env.BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: mimeType },
    });

    // Upload thumbnail if provided
    const thumbFile = formData.get('thumbnail');
    let thumbKey = null;
    if (thumbFile) {
      const thumbName = filename.replace(/\.[^/.]+$/, '.webp');
      thumbKey = `thumbs/${thumbName}`;
      await env.BUCKET.put(thumbKey, await thumbFile.arrayBuffer(), {
        httpMetadata: { contentType: 'image/webp' },
      });
    }

    // Insert into DB
    await env.DB.prepare(
      'INSERT INTO images (id, filename, r2_key, thumb_key, mime_type, file_size) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, filename, r2Key, thumbKey, mimeType, fileSize).run();

    return Response.json({ id, filename, r2Key, thumbKey });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
