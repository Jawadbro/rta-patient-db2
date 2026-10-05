import crypto from 'node:crypto';

const ALLOWED = ['GET', 'POST', 'PATCH', 'DELETE'];

function authorized(req) {
  const supplied = Buffer.from(String(req.headers['x-app-password'] || ''));
  const expected = Buffer.from(String(process.env.APP_PASSWORD || ''));
  if (!expected.length || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(supplied, expected);
}

export default async function handler(req, res) {
  const { NOCODB_URL, NOCODB_TOKEN, NOCODB_TABLE_ID } = process.env;

  if (!ALLOWED.includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!NOCODB_URL || !NOCODB_TOKEN || !NOCODB_TABLE_ID) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const url = new URL(`${NOCODB_URL.replace(/\/$/, '')}/api/v2/tables/${NOCODB_TABLE_ID}/records`);
  if (req.method === 'GET') {
    for (const [k, v] of Object.entries(req.query)) url.searchParams.set(k, v);
  }

  try {
    const r = await fetch(url, {
      method: req.method,
      headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
      body: req.method === 'GET' ? undefined : JSON.stringify(req.body),
    });
    const text = await r.text();
    // NocoDB rejecting the token must not look like a wrong site password
    if (r.status === 401 || r.status === 403) {
      return res.status(502).json({ error: `NocoDB rejected the token (HTTP ${r.status}). Check NOCODB_TOKEN and that it belongs to the same base as the table.` });
    }
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text || '{}');
  } catch {
    res.status(502).json({ error: 'Upstream request failed' });
  }
}
