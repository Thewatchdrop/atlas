// functions/api/media/[key].js
// Handles GET /api/media/:key — serves the file back from R2.
// Kept public (no auth check) since <img>/<video> tags can't send auth headers;
// the random UUID in each key makes files effectively unguessable, which is an
// acceptable tradeoff for an internal team tool. Add auth here later if this
// content ever needs to be genuinely private.

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const key = params.key;

  if (!env.ATLAS_MEDIA) {
    return new Response('Storage not configured', { status: 500 });
  }

  const object = await env.ATLAS_MEDIA.get(key);
  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  const url = new URL(request.url);
  if (url.searchParams.get('download')) {
    const filename = (object.customMetadata && object.customMetadata.filename) || 'download';
    const safe = filename.replace(/"/g, '');
    headers.set('Content-Disposition', `attachment; filename="${safe}"`);
  }

  return new Response(object.body, { headers });
}
