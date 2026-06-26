/**
 * Fire concurrent purchase requests to test Redis lock + stock safety.
 * Usage: node scripts/concurrent-purchase.js [productId] [quantity] [concurrency]
 * Example: node scripts/concurrent-purchase.js 1 1 10
 */
const baseUrl = process.env.API_URL || 'http://localhost/products';

async function purchase(productId, quantity) {
  const res = await fetch(`${baseUrl}/${productId}/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const productId = process.argv[2] || '1';
  const quantity = parseInt(process.argv[3] || '1', 10);
  const concurrency = parseInt(process.argv[4] || '10', 10);

  console.log(`Sending ${concurrency} concurrent purchases for product ${productId}...`);

  const results = await Promise.all(
    Array.from({ length: concurrency }, () => purchase(productId, quantity))
  );

  const ok = results.filter((r) => r.status === 200).length;
  const conflict = results.filter((r) => r.status === 409).length;
  const other = results.filter((r) => r.status !== 200 && r.status !== 409);

  console.log(`200 OK: ${ok}`);
  console.log(`409 Conflict: ${conflict}`);
  if (other.length) console.log('Other:', other);

  const final = await fetch(`${baseUrl}/${productId}`);
  const product = await final.json();
  console.log('Final stock:', product.stock);
}

main().catch(console.error);
