import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal';

export const options = {
  vus: 5,
  duration: '10s',
  thresholds: {
    checks: ['rate>0.95'],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health returns 200': (r) => r.status === 200,
    'health has instance id': (r) => !!r.headers['X-Instance-Id'],
  });

  const products = http.get(`${BASE_URL}/products`);
  check(products, {
    'products returns 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.3);
}
