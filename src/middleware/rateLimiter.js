const { redis } = require('../db/redis');

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 100;

function rateLimiter(options = {}) {
  const windowSec = options.windowSec || WINDOW_SECONDS;
  const max = options.max || MAX_REQUESTS;
  const keyPrefix = options.keyPrefix || 'ratelimit';

  return async (req, res, next) => {
    const ip = req.headers['x-real-ip'] || req.ip || 'unknown';
    const key = `${keyPrefix}:${ip}`;

    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);

    if (count > max) {
      const ttl = await redis.ttl(key);
      res.setHeader('Retry-After', Math.max(ttl, 1));
      return res.status(429).json({
        error: 'Too many requests',
        limit: max,
        windowSeconds: windowSec,
      });
    }

    next();
  };
}

module.exports = rateLimiter;