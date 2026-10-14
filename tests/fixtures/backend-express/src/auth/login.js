const bcrypt = require('bcrypt');
module.exports = async (u, p) => bcrypt.compare(p, u.hash);
