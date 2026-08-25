const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else {
      token = authHeader;
    }
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === 'shopper') {
      req.user = decoded;
    } else {
      req.user = null;
    }
  } catch {
    req.user = null;
  }

  next();
};
