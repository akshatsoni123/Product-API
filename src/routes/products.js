const router = require('express').Router();
const c = require('../controllers/productController');
const rateLimiter = require('../middleware/rateLimiter');

const readLimit = rateLimiter({
  keyPrefix: 'ratelimit:products',
  max: 100,
  windowSec: 60,
});

router.post('/', c.create);
router.get('/', readLimit, c.list);
router.get('/:id', readLimit, c.getById);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
