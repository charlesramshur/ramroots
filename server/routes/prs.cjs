const express = require('express');
const { parseRepo, octo } = require('../agents/builder.cjs');

const router = express.Router();

// Mounted at app.use('/api/self', prsRouter) → /api/self/prs
router.get('/prs', async (req, res) => {
  try {
    const { owner, repo } = parseRepo();
    const o = octo();

    // Optional filter: /api/self/prs?state=open|closed|all  (default: all)
    const state = (req.query.state || 'all').toLowerCase();

    const { data } = await o.pulls.list({
      owner, repo,
      state,               // 'open' | 'closed' | 'all'
      per_page: 10,
      sort: 'updated',
      direction: 'desc'
    });

    const items = await Promise.all(
      data.map(async pr => {
        let mergeable_state = null;
        try {
          const { data: full } = await o.pulls.get({ owner, repo, pull_number: pr.number });
          mergeable_state = full.mergeable_state;
        } catch {}
        return {
          number: pr.number,
          title: pr.title,
          state: pr.state,                // open | closed
          mergeable_state,
          head: pr.head?.ref,
          html_url: pr.html_url
        };
      })
    );

    res.json(items);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch PRs', message: String(e?.message || e) });
  }
});

module.exports = router;
