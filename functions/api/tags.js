// GET /api/tags — get all unique tags across all images
export async function onRequestGet(context) {
  const { env } = context;

  try {
    const { results } = await env.DB.prepare(
      'SELECT DISTINCT tag FROM tags ORDER BY tag'
    ).all();

    return Response.json({ tags: results.map((r) => r.tag) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
