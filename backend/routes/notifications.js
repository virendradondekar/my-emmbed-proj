const express = require('express');
const router = express.Router();
const db = require('../data/db');

router.get('/', (req, res) => res.json(db.notifications || []));

// Mark one as read
router.patch('/:id/read', (req, res) => {
  const n = db.notifications.find(x => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: 'Not found' });
  n.unread = false;
  db.save();
  res.json(n);
});

// Mark all read
router.post('/read-all', (req, res) => {
  (db.notifications || []).forEach(n => n.unread = false);
  db.save();
  res.json({ success: true });
});

module.exports = router;
