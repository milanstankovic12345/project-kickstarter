const express = require('express');
const app = express();
app.use('/users', require('./routes/users'));
module.exports = app;
