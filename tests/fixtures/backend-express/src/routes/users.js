const r = require('express').Router();
r.get('/:id', (req, res) => res.json({ id: req.params.id }));
module.exports = r;
