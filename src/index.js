require('dotenv').config();
const express = require('express');
const instanceId = require('./middleware/instanceId');
const productRoutes = require('./routes/products');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(instanceId);

app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.use('/products', productRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`API [${process.env.INSTANCE_ID || 'local'}] on port ${port}`)
);
