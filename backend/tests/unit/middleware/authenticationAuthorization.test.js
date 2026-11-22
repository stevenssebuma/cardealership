import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateToken, protect, adminOnly, isAdmin } from '../../../middleware/authMiddleware.js';

const createResponse = () => ({
  statusCode: null, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('missing bearer token returns HTTP 401 from canonical authentication', async () => {
  const res = createResponse();
  await authenticateToken({ headers: {} }, res, () => assert.fail('next must not execute'));
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test('malformed bearer token returns HTTP 401 before database access', async () => {
  const res = createResponse();
  await authenticateToken({ headers: { authorization: 'Bearer invalid-token' } }, res, () => assert.fail('next must not execute'));
  assert.equal(res.statusCode, 401);
});

test('only the canonical admin role authorizes administration', () => {
  for (const user of [undefined, { role: 'user' }, { role: 'customer' }, { role: 'administrator' }]) {
    const res = createResponse();
    adminOnly({ user }, res, () => assert.fail('next must not execute'));
    assert.equal(res.statusCode, 403);
  }
  let nextCalls = 0;
  adminOnly({ user: { role: 'admin' } }, createResponse(), () => { nextCalls++; });
  assert.equal(nextCalls, 1);
  assert.equal(protect, authenticateToken);
  assert.equal(adminOnly, isAdmin);
});
