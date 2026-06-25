function validateProduct(body, isUpdate = false) {
  const errors = [];
  if (!isUpdate && !body.name?.trim()) errors.push('name is required');
  if (body.price == null && !isUpdate) errors.push('price is required');
  if (body.price != null && body.price < 0) errors.push('price must be >= 0');
  if (body.stock == null && !isUpdate) errors.push('stock is required');
  if (body.stock != null && body.stock < 0) errors.push('stock must be >= 0');
  return errors;
}

module.exports = { validateProduct };
