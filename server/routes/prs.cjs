const express = require('express');
const { Octokit } = require('@octokit/rest');

const router = express.Router();
const octokit = new Octokit();

router.get('/api/self/prs', async (req, res) => {
    try {
        const response = await octokit.pulls.list({
            owner: 'your-github-username', // replace with your GitHub username
            repo: 'your-repo-name', // replace with your repository name
            per_page: 10
        });
        const prs = response.data.map(pr => ({
            id: pr.id,
            title: pr.title,
            url: pr.html_url,
            created_at: pr.created_at
        }));
        res.json(prs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch PRs' });
    }
});

module.exports = router;