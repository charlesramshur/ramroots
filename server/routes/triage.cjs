// server/routes/triage.cjs
const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

// DB pool (Render Postgres)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- Health ---
router.get('/ping', (_req, res) => res.send('pong'));

router.get('/db-ping', async (_req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS now');
    return res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    console.error('DB PING ERROR:', e);
    return res.status(500).json({ ok: false, error: 'db_error' });
  }
});

// --- Schema bootstrap (no pgvector yet) ---
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

// 1-click setup endpoint
router.post('/setup', async (_req, res) => {
  try {
    await pool.query(bootstrapSQL);
    return res.json({ ok: true, created: true });
  } catch (e) {
    console.error('SETUP ERROR:', e);
    return res.status(500).json({ ok: false, error: 'setup_error' });
  }
});

// Dev helper: insert one email to test later flows
router.get('/debug/seed', async (_req, res) => {
  try {
    const r = await pool.query(
      `INSERT INTO emails ("from", subject, snippet, body)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      ["sender@example.com", "Test subject", "Snippet…", "Full body here."]
    );
    res.json({ ok: true, email_id: r.rows[0].id });
  } catch (e) {
    console.error('SEED ERROR:', e);
    res.status(500).json({ ok: false, error: 'seed_error' });
  }
});

module.exports = router;
