const ensureDriver = (req, res, next) => {
  if (req.user && req.user.role === 'driver') {
    return next();
  }
  return res.status(403).json({ message: 'Forbidden: Driver access only' });
};

module.exports = { ensureDriver };
