// server/routes/triage.cjs
const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

// DB pool (Render Postgres)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Health check
router.get('/ping', (_req, res) => res.send('pong'));

// DB connectivity check
router.get('/db-ping', async (_req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS now');
    return res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    console.error('DB PING ERROR:', e);
    return res.status(500).json({ ok: false, error: 'db_error' });
  }
});

module.exports = router;
