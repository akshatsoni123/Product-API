import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal';

export const options = {
  vus: 1,
  iterations: 110,
  thresholds: {
    'checks{check:got 429}': ['rate>0'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/products`);

  check(res, {
    'status 200 or 429': (r) => r.status === 200 || r.status === 429,
    'got 429': (r) => r.status === 429,
  });
}
