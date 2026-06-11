// GET /api/export?purpose=inference|train-style|train-char&model=anima|sdxl|...
// Returns, for every image, the tags of the best-matching tag set for the
// requested purpose (and optional model). Used by the frontend to build
// per-image .txt caption files (LoRA dataset) or a JSON export.
//
// Set selection per image: purpose must match; with a model filter, an exact
// model match wins over a model-agnostic (NULL) set, and sets pinned to other
// models are excluded. Ties are broken by is_default, then created_at.
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const purpose = url.searchParams.get('purpose') || 'inference';
  const model = url.searchParams.get('model') || null;

  try {
    const { results: images } = await env.DB.prepare(
      'SELECT id, filename FROM images ORDER BY filename'
    ).all();

    let sql = `SELECT ts.image_id AS image_id, ts.id AS set_id, ts.name AS name, ts.model AS model,
                      ts.is_default AS is_default, ts.created_at AS created_at
               FROM tag_sets ts WHERE ts.purpose = ?`;
    const binds = [purpose];
    if (model) {
      sql += ' AND (ts.model = ? OR ts.model IS NULL)';
      binds.push(model);
    }
    sql += ' ORDER BY ts.image_id, ts.is_default DESC, ts.created_at';
    const { results: sets } = await env.DB.prepare(sql).bind(...binds).all();

    // Pick best set per image: exact model match > model-agnostic > order above
    const bestByImage = {};
    for (const s of sets) {
      const cur = bestByImage[s.image_id];
      if (!cur) {
        bestByImage[s.image_id] = s;
      } else if (model && s.model === model && cur.model !== model) {
        bestByImage[s.image_id] = s;
      }
    }

    const setIds = Object.values(bestByImage).map((s) => s.set_id);
    const tagsBySet = {};
    if (setIds.length > 0) {
      const placeholders = setIds.map(() => '?').join(',');
      const { results: tagRows } = await env.DB.prepare(
        `SELECT set_id, tag FROM set_tags WHERE set_id IN (${placeholders}) ORDER BY position`
      ).bind(...setIds).all();
      for (const row of tagRows) {
        (tagsBySet[row.set_id] ||= []).push(row.tag);
      }
    }

    // Unmigrated legacy tags count as model-agnostic inference sets
    const legacyByImage = {};
    if (purpose === 'inference') {
      const { results: legacyRows } = await env.DB.prepare(
        'SELECT image_id, tag FROM tags ORDER BY image_id, position'
      ).all();
      for (const row of legacyRows) {
        (legacyByImage[row.image_id] ||= []).push(row.tag);
      }
    }

    const files = [];
    for (const img of images) {
      const best = bestByImage[img.id];
      if (best) {
        files.push({
          filename: img.filename,
          setName: best.name,
          model: best.model,
          tags: tagsBySet[best.set_id] || [],
        });
      } else if (legacyByImage[img.id]) {
        files.push({
          filename: img.filename,
          setName: 'main',
          model: null,
          tags: legacyByImage[img.id],
        });
      }
    }

    return Response.json({
      purpose,
      model,
      totalImages: images.length,
      matchedImages: files.length,
      files,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
