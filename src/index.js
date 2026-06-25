require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const productRoutes = require('./routes/products');
app.use('/products', productRoutes);

app.listen(process.env.PORT || 3000, () =>
  console.log(`API on port ${process.env.PORT || 3000}`)
);