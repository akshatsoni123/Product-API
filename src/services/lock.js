const { redis } = require('../db/redis');

const LOCK_TTL_MS = 5000;

async function withProductLock(productId, fn) {
  const lockKey = `lock:product:${productId}`;
  const token = `${Date.now()}-${Math.random()}`;
  const acquired = await redis.set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX');

  if (!acquired) {
    const err = new Error('Could not acquire lock');
    err.status = 409;
    throw err;
  }

  try {
    return await fn();
  } finally {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, lockKey, token);
  }
}

module.exports = { withProductLock };
