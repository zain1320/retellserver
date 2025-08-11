// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const fetch = require('node-fetch'); // npm i node-fetch@2
const crypto = require('crypto');

const Retell = require('retell-sdk').default;
const retellClient = new Retell({ apiKey: process.env.RETELL_API_KEY });

const CLOVER_AUTH_BASE = 'https://sandbox.dev.clover.com';
const CLOVER_API_BASE  = 'https://apisandbox.dev.clover.com';

const APP_ID     = process.env.CLOVER_APP_ID;       // your Clover App ID (client_id)
const APP_SECRET = process.env.CLOVER_APP_SECRET;   // keep if using high-trust; omit for PKCE
const BASE_URL   = process.env.BASE_URL || 'http://localhost:3000';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- security & middleware ----------
// Allow being embedded by Clover and avoid CSP/frame blocking inside Clover iframe
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.clover.com https://*.dev.clover.com"
  );
  next();
});
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- simple home so Clover gets 200 ----------
app.get('/', (req, res) => {
  res.status(200).send(`
    <!doctype html>
    <html><body>
      <h3>zainApp server</h3>
      <p><a href="/oauth/start">Connect Clover (sandbox)</a></p>
    </body></html>
  `);
});

// ---------- health ----------
app.get('/health', (_, res) =>
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
);

// ---------- Clover OAuth ----------
const merchantTokens = new Map(); // merchantId -> { access_token, refresh_token, expires_at }

/**
 * START OAuth
 * Clover opens your app in an iframe; use top-level redirect so the authorize page isn't framed.
 */
app.get('/oauth/start', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex'); // optional: persist/verify if you add a session
  const redirectUri = `${BASE_URL}/oauth/callback`;

  const params = new URLSearchParams({
    client_id: APP_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    state
  });

  const authURL = `${CLOVER_AUTH_BASE}/oauth/v2/authorize?${params.toString()}`;
  console.log('[clover] authorize URL ->', authURL);

  // Send small HTML that forces the parent window (outside iframe) to navigate
  res.status(200).send(`
    <!doctype html>
    <html>
      <head>
        <meta http-equiv="refresh" content="0; url='${authURL}'" />
      </head>
      <body>
        <script>window.top.location.href = ${JSON.stringify(authURL)};</script>
        <noscript><a href="${authURL}" target="_top">Continue to Clover</a></noscript>
      </body>
    </html>
  ');
});

/**
 * CALLBACK
 * Clover redirects here with ?code=...&merchant_id=...
 * Exchange code -> tokens and store them.
 */
app.get('/oauth/callback', async (req, res) => {
  try {
    const { code, merchant_id } = req.query;
    if (!code || !merchant_id) {
      return res.status(400).send('Missing code or merchant_id');
    }

    const body = {
      client_id: APP_ID,
      client_secret: APP_SECRET, // if using PKCE, remove this and add code_verifier
      code: String(code)
    };

    const r = await fetch(`${CLOVER_API_BASE}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();

    if (!r.ok) {
      console.error('Token exchange failed:', j);
      return res.status(r.status).send(`Token exchange failed: ${JSON.stringify(j)}`);
    }

    const { access_token, refresh_token, expires_in } = j;
    merchantTokens.set(String(merchant_id), {
      access_token,
      refresh_token,
      expires_at: Date.now() + (expires_in || 0) * 1000
    });

    res
      .status(200)
      .send(
        `Clover connected for merchant ${merchant_id}. ` +
        `Try <a href="/clover/me?merchant_id=${merchant_id}">/clover/me</a> or ` +
        `<a href="/clover/items?merchant_id=${merchant_id}">/clover/items</a>.`
      );
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.status(500).send('OAuth callback error');
  }
});

// Quick test: merchant details
app.get('/clover/me', async (req, res) => {
  const merchantId = String(req.query.merchant_id || '');
  const t = merchantTokens.get(merchantId);
  if (!t) return res.status(400).send('No token stored for that merchant_id');

  const r = await fetch(`${CLOVER_API_BASE}/v3/merchants/${merchantId}`, {
    headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/json' }
  });
  const json = await r.json();
  res.status(r.ok ? 200 : r.status).json(json);
});

// Quick test: items list
app.get('/clover/items', async (req, res) => {
  const merchantId = String(req.query.merchant_id || '');
  const limit = req.query.limit || '5';
  const t = merchantTokens.get(merchantId);
  if (!t) return res.status(400).send('No token stored for that merchant_id');

  const r = await fetch(`${CLOVER_API_BASE}/v3/merchants/${merchantId}/items?limit=${limit}`, {
    headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/json' }
  });
  const json = await r.json();
  res.status(r.ok ? 200 : r.status).json(json);
});

// ---------- Retell endpoints (unchanged) ----------
app.get('/api/calls/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const callDetails = await retellClient.call.getCall(callId);
    res.json({ success: true, data: callDetails });
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/calls/:callId/transcript', async (req, res) => {
  try {
    const { callId } = req.params;
    const callDetails = await retellClient.call.getCall(callId);
    const transcript = callDetails.transcript || [];
    const variables = callDetails.variables || {};
    res.json({
      success: true,
      data: {
        callId,
        transcript,
        variables,
        metadata: {
          duration: callDetails.duration,
          status: callDetails.status,
          startTime: callDetails.start_time,
          endTime: callDetails.end_time
        }
      }
    });
  } catch (error) {
    console.error('Error fetching call transcript:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/calls/:callId/extract-variables', async (req, res) => {
  try {
    const { callId } = req.params;
    const { name, ordered_items, phone_number } = req.body;
    res.json({ success: true, data: { callId, name, ordered_items, phone_number } });
  } catch (error) {
    console.error('Error extracting variables:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/agents/:agentId/calls', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    const calls = await retellClient.call.listCalls({
      agentId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    res.json({ success: true, data: calls });
  } catch (error) {
    console.error('Error fetching agent calls:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/webhook/call-events', (req, res) => {
  try {
    const event = req.body;
    console.log('Received call event:', event);
    res.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------- errors & 404 ----------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Something went wrong!' });
});

app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health: ${BASE_URL}/health`);
  console.log(`OAuth start: ${BASE_URL}/oauth/start`);
});
