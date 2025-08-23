const express = require('express');
const fs = require('fs');
const router = express.Router();
const leadsFilePath = './server/files/leads.json';

// POST endpoint to create a new lead
router.post('/', (req, res) => {
    const newLead = {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        ...req.body
    };

    fs.readFile(leadsFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ ok: false, error: 'Failed to read leads file.' });
        const leads = JSON.parse(data || '[]');
        leads.push(newLead);
        fs.writeFile(leadsFilePath, JSON.stringify(leads), (err) => {
            if (err) return res.status(500).json({ ok: false, error: 'Failed to save lead.' });
            res.json({ ok: true, id: newLead.id, createdAt: newLead.createdAt });
        });
    });
});

// GET endpoint to retrieve the last 50 leads
router.get('/', (req, res) => {
    fs.readFile(leadsFilePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ ok: false, error: 'Failed to read leads file.' });
        const leads = JSON.parse(data || '[]');
        const lastLeads = leads.slice(-50).reverse();
        res.json(lastLeads);
    });
});

module.exports = router;