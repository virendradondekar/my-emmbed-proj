const express = require('express');
const router = express.Router();
const db = require('../data/db');

router.get('/', (req, res) => res.json(db.settings));

router.put('/', (req, res) => {
  Object.assign(db.settings, req.body);
  db.save();
  res.json(db.settings);
});

module.exports = router;
