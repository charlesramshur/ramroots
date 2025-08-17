// server/routes/triage.cjs
const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const router = express.Router();

// DB pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ------------ Health ------------
router.get('/ping', (_req, res) => res.send('pong'));
router.get('/db-ping', async (_req, res) => {
  try { const r = await pool.query('SELECT NOW() AS now'); res.json({ ok: true, now: r.rows[0].now }); }
  catch (e) { console.error('DB PING ERROR:', e); res.status(500).json({ ok: false, error: 'db_error' }); }
});

// ------------ Schema (no pgvector yet) ------------
const bootstrapSQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT UNIQUE,
  thread_id TEXT,
  "from" TEXT NOT NULL,
  subject TEXT NOT NULL,
  snippet TEXT,
  body TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  labels TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  proposed_action TEXT CHECK (proposed_action IN ('reply','archive','label','delete')) NOT NULL,
  rationale TEXT NOT NULL,
  draft_text TEXT,
  confidence NUMERIC CHECK (confidence BETWEEN 0 AND 1) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID UNIQUE REFERENCES proposals(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending','approved','rejected')) NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  token TEXT,
  expires_at TIMESTAMPTZ
);
`;

// Allow GET so you can click it in a browser
router.all('/setup', async (_req, res) => {
  try { await pool.query(bootstrapSQL); res.json({ ok: true, created: true }); }
  catch (e) { console.error('SETUP ERROR:', e); res.status(500).json({ ok: false, error: 'setup_error' }); }
});

// ------------ Core endpoints ------------
function checkToolAuth(req, res) {
  const key = process.env.RAMROOT_API_KEY;
  if (!key) return true; // skip if not set yet
  const auth = req.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing auth' });
  if (auth.slice(7) !== key) return res.status(403).json({ error: 'bad token' });
  return true;
}

// Create a proposal (Relevance will call this)
router.post('/propose', async (req, res) => {
  if (!checkToolAuth(req, res)) return;
  try {
    const { email_id, proposed_action, rationale, draft_text = null, confidence } = req.body || {};
    if (!email_id || !proposed_action || !rationale || confidence == null)
      return res.status(400).json({ error: 'missing fields' });
    await pool.query(
      `INSERT INTO proposals (email_id, proposed_action, rationale, draft_text, confidence)
       VALUES ($1,$2,$3,$4,$5)`,
      [email_id, proposed_action, rationale, draft_text, confidence]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server_error' }); }
});

// List pending proposals
router.get('/proposals', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, e.subject, e."from", e.snippet, e.received_at
      FROM proposals p
      JOIN emails e ON e.id = p.email_id
      LEFT JOIN approvals a ON a.proposal_id = p.id
      WHERE COALESCE(a.status,'pending')='pending'
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (e) { console.error('PROPOSALS ERROR:', e); res.status(500).json({ ok: false, error: 'proposals_error' }); }
});

// Approve / reject (returns token when approved)
router.post('/approve', async (req, res) => {
  const { proposalId, decision, decidedBy = 'owner', draftText } = req.body || {};
  if (!proposalId || !['approved','rejected'].includes(decision))
    return res.status(400).json({ error: 'bad input' });

  await pool.query('BEGIN');
  try {
    if (draftText)
      await pool.query(`UPDATE proposals SET draft_text=$1 WHERE id=$2`, [draftText, proposalId]);

    await pool.query(
      `INSERT INTO approvals (proposal_id, status, decided_by, decided_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (proposal_id) DO UPDATE
       SET status=EXCLUDED.status, decided_by=EXCLUDED.decided_by, decided_at=EXCLUDED.decided_at`,
      [proposalId, decision, decidedBy]
    );

    let token = null;
    if (decision === 'approved') {
      token = crypto.randomBytes(24).toString('hex');
      const exp = new Date(Date.now() + 15 * 60 * 1000); // 15 min
      await pool.query(`UPDATE approvals SET token=$1, expires_at=$2 WHERE proposal_id=$3`,
        [token, exp, proposalId]);
    }
    await pool.query('COMMIT');
    res.json({ ok: true, token });
  } catch (e) { await pool.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'server_error' }); }
});

// Execute (requires approval token) — SIMULATED for now
router.post('/execute', async (req, res) => {
  const { proposalId, token } = req.body || {};
  if (!proposalId || !token) return res.status(400).json({ error: 'missing input' });

  const { rows } = await pool.query(`SELECT * FROM approvals WHERE proposal_id=$1`, [proposalId]);
  const a = rows[0];
  if (!a || a.status !== 'approved') return res.status(403).json({ error: 'not approved' });
  if (a.token !== token) return res.status(403).json({ error: 'bad token' });
  if (a.expires_at && new Date(a.expires_at) < new Date())
    return res.status(403).json({ error: 'token expired' });

  const p = (await pool.query(`SELECT * FROM proposals WHERE id=$1`, [proposalId])).rows[0];
  const e = (await pool.query(`SELECT * FROM emails WHERE id=$1`, [p.email_id])).rows[0];

  console.log('SIMULATED EXECUTION:', p.proposed_action, { subject: e?.subject });
  await pool.query(`UPDATE approvals SET token=NULL, expires_at=NULL WHERE proposal_id=$1`, [proposalId]);
  res.json({ ok: true, simulated: true });
});

// ------------ Debug endpoints (clickable from browser) ------------
router.get('/debug/seed', async (_req, res) => {
  try {
    const r = await pool.query(
      `INSERT INTO emails ("from", subject, snippet, body)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      ['sender@example.com', 'Test subject', 'Snippet…', 'Full body here.']
    );
    res.json({ ok: true, email_id: r.rows[0].id });
  } catch (e) { console.error('SEED ERROR:', e); res.status(500).json({ ok: false, error: 'seed_error' }); }
});

// Create a proposal without auth (for quick testing in browser)
router.get('/propose-debug', async (req, res) => {
  try {
    const { email_id, action = 'label' } = req.query;
    if (!email_id) return res.status(400).json({ error: 'email_id required' });
    await pool.query(
      `INSERT INTO proposals (email_id, proposed_action, rationale, draft_text, confidence)
       VALUES ($1,$2,$3,$4,$5)`,
      [email_id, action, 'debug: pipeline test', 'Thanks for your email — noted.', 0.9]
    );
    res.json({ ok: true });
  } catch (e) { console.error('PROPOSE-DEBUG ERROR:', e); res.status(500).json({ ok: false, error: 'propose_debug_error' }); }
});

// Approve quickly from browser
router.get('/approve-debug', async (req, res) => {
  const { proposal_id, decision = 'approved' } = req.query;
  if (!proposal_id) return res.status(400).json({ error: 'proposal_id required' });
  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO approvals (proposal_id, status, decided_by, decided_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (proposal_id) DO UPDATE
       SET status=EXCLUDED.status, decided_by=EXCLUDED.decided_by, decided_at=EXCLUDED.decided_at`,
      [proposal_id, decision, 'owner']
    );
    let token = null;
    if (decision === 'approved') {
      token = crypto.randomBytes(24).toString('hex');
      const exp = new Date(Date.now() + 15 * 60 * 1000);
      await pool.query(`UPDATE approvals SET token=$1, expires_at=$2 WHERE proposal_id=$3`,
        [token, exp, proposal_id]);
    }
    await pool.query('COMMIT');
    res.json({ ok: true, token });
  } catch (e) { await pool.query('ROLLBACK'); console.error('APPROVE-DEBUG ERROR:', e); res.status(500).json({ ok: false, error: 'approve_debug_error' }); }
});

// Execute quickly from browser
router.get('/execute-debug', async (req, res) => {
  const { proposal_id, token } = req.query;
  if (!proposal_id || !token) return res.status(400).json({ error: 'proposal_id and token required' });
  const { rows } = await pool.query(`SELECT * FROM approvals WHERE proposal_id=$1`, [proposal_id]);
  const a = rows[0];
  if (!a || a.status !== 'approved') return res.status(403).json({ error: 'not approved' });
  if (a.token !== token) return res.status(403).json({ error: 'bad token' });
  if (a.expires_at && new Date(a.expires_at) < new Date())
    return res.status(403).json({ error: 'token expired' });
  await pool.query(`UPDATE approvals SET token=NULL, expires_at=NULL WHERE proposal_id=$1`, [proposal_id]);
  res.json({ ok: true, simulated: true });
});

module.exports = router;
