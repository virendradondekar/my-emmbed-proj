const express = require('express');
const router = express.Router();
const db = require('../data/db');

router.get('/', (req, res) => res.json(db.activity || []));

router.delete('/', (req, res) => {
  db.activity = [];
  db.save();
  res.json({ success: true });
});

module.exports = router;
