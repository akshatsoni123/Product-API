const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('error', (err) => console.error('Redis error:', err.message));

const TTL_SECONDS = 600; // 10 minutes

module.exports = { redis, TTL_SECONDS };