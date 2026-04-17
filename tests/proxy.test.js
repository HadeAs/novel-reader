const request = require('supertest');
const app = require('../backend/server');

describe('GET /proxy', () => {
  test('returns 400 when url param missing', async () => {
    const res = await request(app).get('/proxy');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('returns 502 when target URL unreachable', async () => {
    const res = await request(app)
      .get('/proxy')
      .query({ url: 'http://localhost:19999/nonexistent' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBeTruthy();
  });

  test('returns 200 or 502 for reachable URL (not 400/500)', async () => {
    const res = await request(app)
      .get('/proxy')
      .query({ url: 'http://example.com' });
    expect([200, 502]).toContain(res.status);
  });
});
