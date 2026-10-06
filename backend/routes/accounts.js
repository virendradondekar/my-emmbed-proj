const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../data/db');

// GET all accounts
router.get('/', (req, res) => {
  res.json(db.accounts);
});

// POST create account
router.post('/', (req, res) => {
  const { name, email, color } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  const account = { id: uuidv4(), name, email, color: color || '#4F8EF7' };
  db.accounts.push(account);
  db.save();
  res.status(201).json(account);
});

// PUT update account
router.put('/:id', (req, res) => {
  const acc = db.accounts.find(a => a.id === req.params.id);
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  const { name, email, color } = req.body;
  if (name) acc.name = name;
  if (email) acc.email = email;
  if (color) acc.color = color;
  db.save();
  res.json(acc);
});

// DELETE account
router.delete('/:id', (req, res) => {
  const idx = db.accounts.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Account not found' });
  if (db.accounts.length <= 1) return res.status(400).json({ error: 'Cannot delete your only account' });
  db.accounts.splice(idx, 1);
  // Remove items belonging to this account
  db.items = db.items.filter(i => i.acctId !== req.params.id);
  // Clean up VS integration
  if (db.vsIntegration?.connectedAccts) {
    delete db.vsIntegration.connectedAccts[req.params.id];
  }
  db.save();
  res.json({ success: true });
});

module.exports = router;
