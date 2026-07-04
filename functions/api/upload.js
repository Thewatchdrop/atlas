// functions/api/upload.js
// Handles POST /api/upload — streams the uploaded file straight into R2.
// Auth is checked by asking Supabase to validate the access token the app sends.

const SUPABASE_URL = 'https://dkhvgzqfograzcrhsedz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_WCJwO2il8A3sXFpamAxOQQ_uJXOmDOp';

async function verifyUser(request) {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const user = await verifyUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.ATLAS_MEDIA) {
    return new Response(JSON.stringify({ error: 'Storage not configured (missing ATLAS_MEDIA binding)' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const rawFilename = request.headers.get('X-Filename') || 'file';
  const filename = decodeURIComponent(rawFilename);
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

  // Random key so files aren't easily guessable, keeps original name for downloads.
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  const key = `${crypto.randomUUID()}-${safeName}`;

  try {
    // request.body is a stream — this writes straight to R2 without
    // buffering the whole file in the Worker's memory.
    await env.ATLAS_MEDIA.put(key, request.body, {
      httpMetadata: { contentType },
      customMetadata: { filename }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Upload failed: ' + (e && e.message ? e.message : e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ key, filename }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
