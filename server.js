// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const Retell = require('retell-sdk').default;
const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

// === Clover OAuth constants ===
const fetch = require('node-fetch'); // npm i node-fetch@2
const crypto = require('crypto');

const CLOVER_AUTH_BASE = 'https://sandbox.dev.clover.com';
const CLOVER_API_BASE  = 'https://apisandbox.dev.clover.com';

const APP_ID     = process.env.CLOVER_APP_ID;     // required
const APP_SECRET = process.env.CLOVER_APP_SECRET; // required for high-trust (server) flow
const BASE_URL   = process.env.BASE_URL;          // e.g., https://retellserver.onrender.com

if (!APP_ID || !BASE_URL) {
  console.warn('[WARN] Missing CLOVER_APP_ID or BASE_URL in .env');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------- Health --------------------
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// -------------------- Clover OAuth --------------------
// simple in-memory store; replace with DB for real use
const merchantTokens = new Map(); // merchantId -> { access_token, refresh_token, expires_at }

app.get('/oauth/start', (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex'); // you can persist/verify if you add a session
    const redirectUri = `${BASE_URL}/oauth/callback`;

    const params = new URLSearchParams({
      client_id: APP_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    });

    const url = `${CLOVER_AUTH_BASE}/oauth/v2/authorize?${params.toString()}`;
    return res.redirect(url);
  } catch (e) {
    console.error('OAuth start error:', e);
    return res.status(500).send('OAuth start error');
  }
});

// Clover redirects here with ?code=...&merchant_id=...
app.get('/oauth/callback', async (req, res) => {
  try {
    const { code, merchant_id } = req.query;
    if (!code || !merchant_id) {
      return res.status(400).send('Missing code or merchant_id');
    }

    const body = {
      client_id: APP_ID,
      // If you switch to PKCE (low-trust), remove client_secret and include code_verifier instead.
      client_secret: APP_SECRET,
      code: String(code),
    };

    const tokenResp = await fetch(`${CLOVER_API_BASE}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const tokenJson = await tokenResp.json();

    if (!tokenResp.ok) {
      console.error('Token exchange failed:', tokenJson);
      return res
        .status(tokenResp.status)
        .send(`Token exchange failed: ${JSON.stringify(tokenJson)}`);
    }

    const { access_token, refresh_token, expires_in } = tokenJson;
    merchantTokens.set(String(merchant_id), {
      access_token,
      refresh_token,
      expires_at: Date.now() + (expires_in || 0) * 1000,
    });

    // Success page (you can redirect to your UI instead)
    return res
      .status(200)
      .send(`Clover connected for merchant ${merchant_id}. You can call APIs now.`);
  } catch (e) {
    console.error('OAuth callback error:', e);
    return res.status(500).send('OAuth callback error');
  }
});

// Quick test route to call Clover using stored token
app.get('/clover/me', async (req, res) => {
  const merchantId = String(req.query.merchant_id || '');
  const t = merchantTokens.get(merchantId);
  if (!t) return res.status(400).send('No token stored for that merchant_id');

  const r = await fetch(`${CLOVER_API_BASE}/v3/merchants/${merchantId}`, {
    headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/json' },
  });
  const json = await r.json();
  return res.status(r.ok ? 200 : r.status).json(json);
});

// Another small test: items list
app.get('/clover/items', async (req, res) => {
  const merchantId = String(req.query.merchant_id || '');
  const limit = req.query.limit || '5';
  const t = merchantTokens.get(merchantId);
  if (!t) return res.status(400).send('No token stored for that merchant_id');

  const r = await fetch(`${CLOVER_API_BASE}/v3/merchants/${merchantId}/items?limit=${limit}`, {
    headers: { Authorization: `Bearer ${t.access_token}`, Accept: 'application/json' },
  });
  const json = await r.json();
  return res.status(r.ok ? 200 : r.status).json(json);
});

// -------------------- Retell endpoints (unchanged) --------------------
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
          endTime: callDetails.end_time,
        },
      },
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
      offset: parseInt(offset),
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
    switch (event.event_type) {
      case 'call_started':
        console.log('Call started:', event.call_id);
        break;
      case 'call_ended':
        console.log('Call ended:', event.call_id);
        break;
      case 'transcript_updated':
        console.log('Transcript updated for call:', event.call_id);
        break;
      default:
        console.log('Unknown event type:', event.event_type);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------- Errors & 404 --------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Something went wrong!' });
});

app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`OAuth start: ${BASE_URL}/oauth/start`);
});