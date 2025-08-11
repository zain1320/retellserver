const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();
const fetch = require('node-fetch'); // npm i node-fetch@2
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BASE_URL = process.env.BASE_URL; // e.g., https://portal.yourdomain.com
const STATE_SECRET = process.env.STATE_SECRET || crypto.randomBytes(32).toString('hex');
const CLOVER_ENV = (process.env.CLOVER_ENV || 'sandbox').toLowerCase();

const CLOVER_HOSTS = {
  sandbox: { authorize: 'https://sandbox.dev.clover.com', api: 'https://apisandbox.dev.clover.com' },
  prod:    { authorize: 'https://clover.com',              api: 'https://api.clover.com' }
}[CLOVER_ENV];

const APP_ID = process.env.CLOVER_APP_ID;
const APP_SECRET = process.env.CLOVER_APP_SECRET; // for server-side (high-trust) flow

// --- guards ---
if (!BASE_URL) throw new Error('BASE_URL is required');
if (!/^https:\/\//.test(BASE_URL)) console.warn('[WARN] BASE_URL should be https in production');
if (!APP_ID) throw new Error('CLOVER_APP_ID is required');
if (!APP_SECRET) console.warn('[WARN] CLOVER_APP_SECRET missing. If you plan PKCE later, that’s fine; this sample uses server secret.');

// --- middleware ---
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- very small file "DB" (fine for pilots; replace with Postgres later) ---
const DB_FILE = path.join(__dirname, 'data', 'db.json');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ tenants: {}, tokens: {} }, null, 2));

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

// helpers
const nowIso = () => new Date().toISOString();
const signState = (obj) => {
  const payload = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
};
const verifyState = (state) => {
  const [payload, sig] = (state || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
};

const AUTH_BASE = CLOVER_HOSTS.authorize;
const API_BASE  = CLOVER_HOSTS.api;

// --- health ---
app.get('/health', (_, res) => res.json({ status: 'OK', env: CLOVER_ENV, timestamp: nowIso() }));

// ========== PORTAL UI ==========

// Landing: create/select a tenant (merchant record)
app.get('/', (req, res) => res.redirect('/portal'));

app.get('/portal', (req, res) => {
  const db = readDB();
  const list = Object.values(db.tenants);
  res.status(200).send(`
<!doctype html>
<html>
  <head><title>Merchant Portal</title></head>
  <body style="font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto;">
    <h2>Merchant Portal</h2>
    <p>Create an entry for a restaurant, then connect Clover.</p>
    <form method="POST" action="/portal/start" style="display:flex; flex-direction:column; gap:8px; max-width:420px;">
      <label>Business Name <input name="businessName" required /></label>
      <label>Email <input name="email" type="email" required /></label>
      <button type="submit">Continue</button>
    </form>
    <hr/>
    <h3>Existing</h3>
    <ul>
      ${list.map(t => `
        <li>
          <a href="/portal/tenant/${t.id}">${t.businessName}</a>
          ${t.merchant_id ? ' — <strong>Connected</strong>' : ' — <em>Not connected</em>'}
        </li>`).join('')}
    </ul>
  </body>
</html>`);
});

app.post('/portal/start', (req, res) => {
  const id = crypto.randomUUID();
  const businessName = String(req.body.businessName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const db = readDB();
  db.tenants[id] = { id, businessName, email, createdAt: nowIso() };
  writeDB(db);
  res.redirect(`/portal/tenant/${id}`);
});

app.get('/portal/tenant/:tid', (req, res) => {
  const db = readDB();
  const t = db.tenants[req.params.tid];
  if (!t) return res.status(404).send('Tenant not found');
  const token = t.merchant_id ? db.tokens[t.merchant_id] : null;
  const connected = Boolean(t.merchant_id && token);
  res.status(200).send(`
<!doctype html>
<html>
  <head><title>${t.businessName} — Portal</title></head>
  <body style="font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto;">
    <h2>${t.businessName} — Merchant Portal</h2>
    <p><strong>Email:</strong> ${t.email}</p>
    <h3>Connection</h3>
    <p>Status: ${connected ? '<span style="color:green">Connected</span>' : '<span style="color:#b00">Not connected</span>'}</p>
    ${connected ? `
      <p><strong>merchant_id:</strong> ${t.merchant_id}</p>
      <form method="POST" action="/portal/reconnect/${t.id}" style="display:inline-block;margin-right:8px">
        <button type="submit">Reconnect</button>
      </form>
      <form method="POST" action="/portal/disconnect/${t.id}" style="display:inline-block">
        <button type="submit">Disconnect</button>
      </form>
    ` : `
      <form method="POST" action="/portal/connect/${t.id}">
        <button type="submit">Connect Clover</button>
      </form>
    `}
    <hr/>
    <h3>Quick Tests</h3>
    <ul>
      <li><a href="/portal/api/me/${t.id}">Fetch Merchant (GET /v3/merchants/{id})</a></li>
      <li><a href="/portal/api/items/${t.id}?limit=10">List Items (GET /items)</a></li>
    </ul>
    <p style="margin-top:24px"><a href="/portal">← Back</a></p>
  </body>
</html>`);
});

// begin OAuth
app.post('/portal/connect/:tid', (req, res) => {
  const db = readDB();
  const t = db.tenants[req.params.tid];
  if (!t) return res.status(404).send('Tenant not found');
  const state = signState({ tid: t.id, ts: Date.now(), nonce: crypto.randomUUID() });
  const redirectUri = `${BASE_URL}/oauth/callback`;
  const params = new URLSearchParams({
    client_id: process.env.CLOVER_APP_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    state
  });
  return res.redirect(`${AUTH_BASE}/oauth/v2/authorize?${params.toString()}`);
});

// reconnect = same as connect
app.post('/portal/reconnect/:tid', (req, res) => {
  const db = readDB();
  const t = db.tenants[req.params.tid];
  if (!t) return res.status(404).send('Tenant not found');
  const state = signState({ tid: t.id, ts: Date.now(), nonce: crypto.randomUUID() });
  const redirectUri = `${BASE_URL}/oauth/callback`;
  const params = new URLSearchParams({
    client_id: process.env.CLOVER_APP_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    state
  });
  return res.redirect(`${AUTH_BASE}/oauth/v2/authorize?${params.toString()}`);
});

// disconnect (forget tokens locally)
app.post('/portal/disconnect/:tid', (req, res) => {
  const db = readDB();
  const t = db.tenants[req.params.tid];
  if (!t) return res.status(404).send('Tenant not found');
  if (t.merchant_id) delete db.tokens[t.merchant_id];
  t.merchant_id = undefined;
  t.connectedAt = undefined;
  writeDB(db);
  res.redirect(`/portal/tenant/${t.id}`);
});

// OAuth callback
app.get('/oauth/callback', async (req, res) => {
  try {
    const { code, merchant_id, state } = req.query;
    if (!code || !merchant_id || !state) return res.status(400).send('Missing parameters');

    const parsed = verifyState(String(state));
    if (!parsed || !parsed.tid) return res.status(400).send('Invalid state');

    const db = readDB();
    const t = db.tenants[parsed.tid];
    if (!t) return res.status(400).send('Unknown tenant');

    // exchange code -> tokens
    const tokenResp = await fetch(`${API_BASE}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: APP_ID,
        client_secret: APP_SECRET, // PKCE path would use code_verifier instead
        code: String(code)
      })
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) {
      console.error('Token exchange failed:', tokenJson);
      return res.status(tokenResp.status).send(`Token exchange failed: ${JSON.stringify(tokenJson)}`);
    }

    const { access_token, refresh_token, expires_in } = tokenJson;
    const expires_at = Date.now() + (expires_in || 0) * 1000;

    // store
    db.tokens[String(merchant_id)] = {
      access_token, refresh_token, expires_at, tenantId: t.id
    };
    t.merchant_id = String(merchant_id);
    t.connectedAt = nowIso();

    // optional: fetch merchant name to display
    try {
      const r = await fetch(`${API_BASE}/v3/merchants/${merchant_id}`, {
        headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' }
      });
      const j = await r.json();
      if (r.ok && j && j.name && (!t.businessName || t.businessName === '')) {
        t.businessName = j.name;
      }
    } catch {}

    writeDB(db);
    return res.redirect(`/portal/tenant/${t.id}`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    return res.status(500).send('OAuth callback error');
  }
});

// token helper
async function ensureFreshToken(db, merchantId) {
  const rec = db.tokens[merchantId];
  if (!rec) throw new Error('Not connected');
  if (rec.expires_at && Date.now() < rec.expires_at - 60_000) return rec;
  // refresh:
  const r = await fetch(`${API_BASE}/oauth/v2/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      refresh_token: rec.refresh_token
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Refresh failed: ${JSON.stringify(j)}`);
  const { access_token, refresh_token, expires_in } = j;
  rec.access_token = access_token;
  if (refresh_token) rec.refresh_token = refresh_token;
  rec.expires_at = Date.now() + (expires_in || 0) * 1000;
  db.tokens[merchantId] = rec;
  writeDB(db);
  return rec;
}

// demo API buttons
app.get('/portal/api/me/:tid', async (req, res) => {
  const db = readDB();
  const t = db.tenants[req.params.tid];
  if (!t || !t.merchant_id) return res.status(400).send('Tenant not connected');
  try {
    const tok = await ensureFreshToken(db, t.merchant_id);
    const r = await fetch(`${API_BASE}/v3/merchants/${t.merchant_id}`, {
      headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/json' }
    });
    const j = await r.json();
    return res.status(r.ok ? 200 : r.status).type('json').send(j);
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

app.get('/portal/api/items/:tid', async (req, res) => {
  const db = readDB();
  const t = db.tenants[req.params.tid];
  if (!t || !t.merchant_id) return res.status(400).send('Tenant not connected');
  const limit = req.query.limit || '10';
  try {
    const tok = await ensureFreshToken(db, t.merchant_id);
    const r = await fetch(`${API_BASE}/v3/merchants/${t.merchant_id}/items?limit=${encodeURIComponent(limit)}`, {
      headers: { Authorization: `Bearer ${tok.access_token}`, Accept: 'application/json' }
    });
    const j = await r.json();
    return res.status(r.ok ? 200 : r.status).type('json').send(j);
  } catch (e) {
    return res.status(500).send(e.message);
  }
});

// 404 & errors
app.use((req, res) => res.status(404).send('Not found'));
app.use((err, req, res, next) => {
  console.error(err); res.status(500).send('Server error');
});

app.listen(PORT, () => {
  console.log(`Portal listening on :${PORT}`);
  console.log(`Open ${BASE_URL}/portal`);
  console.log(`Clover env=${CLOVER_ENV}  Auth=${AUTH_BASE}  API=${API_BASE}`);
});
