const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../data/db');

// GET all items (optionally filter by acctId)
router.get('/', (req, res) => {
  let items = db.items;
  if (req.query.acctId) {
    const ids = req.query.acctId.split(',');
    items = items.filter(i => ids.includes(i.acctId));
  }
  if (req.query.category) {
    items = items.filter(i => i.category === req.query.category);
  }
  res.json(items);
});

// GET single item
router.get('/:id', (req, res) => {
  const item = db.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

// POST create item
router.post('/', (req, res) => {
  const { name, expiry, acctId } = req.body;
  if (!name || !expiry) return res.status(400).json({ error: 'name and expiry required' });
  const item = {
    id: uuidv4(),
    acctId: acctId || db.accounts[0]?.id,
    name,
    category: req.body.category || 'SaaS',
    plan:     req.body.plan     || '',
    cost:     req.body.cost     || '0',
    currency: req.body.currency || '₹ INR',
    cycle:    req.body.cycle    || 'monthly',
    start:    req.body.start    || '',
    expiry,
    notes:    req.body.notes    || '',
    key:      req.body.key      || '',
    seats:    req.body.seats    || '1',
    url:      req.body.url      || '',
    isDraft:  req.body.isDraft  || false,
    createdAt: new Date().toISOString()
  };
  db.items.push(item);
  db.activity.unshift({ id: uuidv4(), text: `Added ${item.name}`, ico: '✚', color: 'var(--acc-bg)', ts: Date.now() });
  if (db.activity.length > 30) db.activity.pop();
  db.save();
  res.status(201).json(item);
});

// PUT update item
router.put('/:id', (req, res) => {
  const idx = db.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  db.items[idx] = { ...db.items[idx], ...req.body, id: req.params.id };
  db.save();
  res.json(db.items[idx]);
});

// PATCH confirm draft
router.patch('/:id/confirm', (req, res) => {
  const item = db.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  item.isDraft = false;
  db.activity.unshift({ id: uuidv4(), text: `Confirmed ${item.name}`, ico: '✓', color: 'var(--grn-bg)', ts: Date.now() });
  db.save();
  res.json(item);
});

// DELETE item
router.delete('/:id', (req, res) => {
  const idx = db.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  const [deleted] = db.items.splice(idx, 1);
  db.activity.unshift({ id: uuidv4(), text: `Deleted ${deleted.name}`, ico: '✕', color: 'var(--red-bg)', ts: Date.now() });
  if (db.activity.length > 30) db.activity.pop();
  db.save();
  res.json({ success: true });
});

module.exports = router;
