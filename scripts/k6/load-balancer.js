import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal';

export const options = {
  vus: 10,
  iterations: 30,
  thresholds: {
    'checks{check:status 200}': ['rate==1.0'],
    'checks{check:has X-Instance-Id}': ['rate==1.0'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/health`);

  check(res, {
    'status 200': (r) => r.status === 200,
    'has X-Instance-Id': (r) =>
      ['api-1', 'api-2', 'api-3'].includes(r.headers['X-Instance-Id']),
  });
}
