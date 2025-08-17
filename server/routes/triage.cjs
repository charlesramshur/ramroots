// server/routes/triage.cjs
const express = require('express');
const router = express.Router();

// minimal health route
router.get('/ping', (_req, res) => res.send('pong'));

module.exports = router;
