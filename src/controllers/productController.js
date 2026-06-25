const pool = require('../db/pool');
const { validateProduct } = require('../validators/product');
const {
  productKey,
  listKey,
  getCached,
  setCached,
  invalidateProduct,
  invalidateAllLists,
} = require('../services/cache');

exports.create = async (req, res) => {
  const errors = validateProduct(req.body);
  if (errors.length) return res.status(400).json({ error: errors });
  const { name, description, price, stock } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO products (name, description, price, stock) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, description ?? null, price, stock]
  );
  await invalidateAllLists();
  res.status(201).json(rows[0]);
};

exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const key = listKey(page);

  const cached = await getCached(key);
  if (cached) {
    console.log(`CACHE HIT  ${key}`);
    return res.json(cached);
  }

  console.log(`CACHE MISS ${key}`);
  const { rows } = await pool.query('SELECT * FROM products ORDER BY id');
  await setCached(key, rows);
  res.json(rows);
};

exports.getById = async (req, res) => {
  const id = req.params.id;
  const key = productKey(id);

  const cached = await getCached(key);
  if (cached) {
    console.log(`CACHE HIT  ${key}`);
    return res.json(cached);
  }

  console.log(`CACHE MISS ${key}`);
  const { rows } = await pool.query('SELECT * FROM products WHERE id=$1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  await setCached(key, rows[0]);
  res.json(rows[0]);
};

exports.update = async (req, res) => {
  const errors = validateProduct(req.body, true);
  if (errors.length) return res.status(400).json({ error: errors });

  const { name, description, price, stock } = req.body;
  const { rows } = await pool.query(
    'UPDATE products SET name=$1, description=$2, price=$3, stock=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
    [name, description ?? null, price, stock, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  await invalidateProduct(req.params.id);
  await invalidateAllLists();
  res.json(rows[0]);
};

exports.remove = async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Not found' });

  await invalidateProduct(req.params.id);
  await invalidateAllLists();
  res.status(204).send();
};
