// GET /api/tags — all unique tags across tag sets
// Optional filters: ?purpose=inference|train-style|train-char  ?model=anima|sdxl|...
// (sets with model = NULL are treated as model-agnostic and always included)
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const purpose = url.searchParams.get('purpose');
  const model = url.searchParams.get('model');

  try {
    const conditions = [];
    const binds = [];
    if (purpose) {
      conditions.push('ts.purpose = ?');
      binds.push(purpose);
    }
    if (model) {
      conditions.push('(ts.model = ? OR ts.model IS NULL)');
      binds.push(model);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    let sql = `SELECT DISTINCT st.tag AS tag FROM set_tags st JOIN tag_sets ts ON ts.id = st.set_id${where}`;

    // Legacy rows (not yet migrated) have no purpose/model; treat them as
    // model-agnostic inference tags.
    if (!purpose || purpose === 'inference') {
      sql += ' UNION SELECT DISTINCT tag FROM tags';
    }
    sql = `SELECT tag FROM (${sql}) ORDER BY tag`;

    const { results } = await env.DB.prepare(sql).bind(...binds).all();

    return Response.json({ tags: results.map((r) => r.tag) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
