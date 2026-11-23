import test from 'node:test';
import assert from 'node:assert/strict';
import { createExchangeRateRepository, normalizeRates } from '../../../repositories/exchangeRateRepository.js';
import { createSnapshot } from '../../fixtures/exchangeRateFixtures.js';

test('repository uses parameterized JSONB persistence and maps native PostgreSQL rows', async () => {
  let write;
  const repository = createExchangeRateRepository({ async query(sql, params) {
    write = { sql, params };
    return { rows: [{ id: '1', base_currency: params[0], rates: JSON.parse(params[1]), provider: params[2],
      retrieved_at: new Date(params[3]), observed_at: new Date(params[4]), expires_at: new Date(params[5]) }] };
  } });
  const snapshot = await repository.saveFreshSnapshot(createSnapshot({ baseCurrency: 'ugx', rates: { ugx: 1, usd: 0.00027 } }));
  assert.match(write.sql, /\$2::jsonb/);
  assert.match(write.sql, /RETURNING/);
  assert.equal(snapshot.id, '1');
  assert.equal(snapshot.baseCurrency, 'UGX');
  assert.equal(snapshot.rates.USD, 0.00027);
  assert.equal(snapshot.retrievedAt.toISOString(), '2026-09-18T10:00:00.000Z');
});

test('invalid rates and chronology are rejected before database access', async () => {
  const repository = createExchangeRateRepository({ query() { assert.fail('Unexpected database access'); } });
  for (const overrides of [{ rates: {} }, { rates: { UGX: 2 } }, { provider: ' ' }, { expiresAt: 'invalid' }, { expiresAt: '2020-01-01' }]) {
    await assert.rejects(repository.saveFreshSnapshot(createSnapshot(overrides)), TypeError);
  }
  await assert.rejects(repository.saveFreshSnapshot(createSnapshot({ provider: 'frankfurter' })), /observation date/);
  assert.throws(() => createExchangeRateRepository({}), TypeError);
});

test('rate normalization rejects zero, negative, infinite and non-numeric rates', () => {
  for (const invalidRate of [0, -1, Infinity, NaN, '1']) assert.throws(() => normalizeRates({ USD: invalidRate }), TypeError);
});

test('lookups bind currency and timestamp, order deterministically, and perform no DDL', async () => {
  const calls = [];
  const repository = createExchangeRateRepository({ async query(sql, params) { calls.push({ sql, params }); return { rows: [] }; } });
  assert.equal(await repository.findLatestSnapshot('ugx'), null);
  assert.equal(await repository.findLatestUsableSnapshot('USD', new Date('2026-09-18T11:00:00Z')), null);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => /^SELECT/.test(call.sql)));
  assert.match(calls[0].sql, /ORDER BY retrieved_at DESC, id DESC LIMIT 1/);
  assert.deepEqual(calls[0].params, ['UGX']);
  assert.match(calls[1].sql, /retrieved_at <= \$2 AND expires_at > \$2/);
  assert.deepEqual(calls[1].params, ['USD', '2026-09-18T11:00:00.000Z']);
});

test('database failure is propagated and a later read can recover', async () => {
  let attempts = 0;
  const repository = createExchangeRateRepository({ async query() {
    if (++attempts === 1) throw new Error('database temporarily unavailable');
    return { rows: [] };
  } });
  await assert.rejects(repository.findLatestSnapshot('UGX'), /temporarily unavailable/);
  assert.equal(await repository.findLatestSnapshot('UGX'), null);
  assert.equal(attempts, 2);
});
