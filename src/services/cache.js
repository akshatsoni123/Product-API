const { redis, TTL_SECONDS } = require('../db/redis');

const productKey = (id) => `product:${id}`;
const listKey = (page = 1) => `products:list:${page}`;

async function getCached(key) {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function setCached(key, value) {
  await redis.set(key, JSON.stringify(value), 'EX', TTL_SECONDS);
}

async function invalidateProduct(id) {
  await redis.del(productKey(id));
}

async function invalidateAllLists() {
  const keys = await redis.keys('products:list:*');
  if (keys.length) await redis.del(...keys);
}

module.exports = { productKey, listKey, getCached, setCached, invalidateProduct, invalidateAllLists };