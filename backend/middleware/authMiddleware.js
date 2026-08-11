const jwt = require('jsonwebtoken');
const { getSetting } = require('../db/database');

const JWT_SECRET = getSetting('JWT_SECRET', 'super_secret_televideo_key_2026');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', passcodeRequired: true });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', passcodeRequired: true });
  }
}

module.exports = authMiddleware;
