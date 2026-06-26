module.exports = (req, res, next) => {
    res.setHeader('X-Instance-Id', process.env.INSTANCE_ID || 'unknown');
    next();
  };