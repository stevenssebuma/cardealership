import db from '../config/db.js';
import { normalizeCurrency, normalizeRates, parseExchangeRateTimestamp } from '../services/exchangeRates/normalizeExchangeRates.js';

// Re-export these helpers for existing consumers without coupling validation to SQLite.
export { normalizeCurrency, normalizeRates };

const columns = 'id, base_currency, rates, provider, retrieved_at, observed_at, expires_at';
const ordering = 'ORDER BY retrieved_at DESC, id DESC LIMIT 1';

function validateSnapshot(snapshot) {
  const baseCurrency = normalizeCurrency(snapshot.baseCurrency);
  const rates = normalizeRates(snapshot.rates);
  if (rates[baseCurrency] !== 1) throw new TypeError('Base-currency rate must equal one.');
  if (typeof snapshot.provider !== 'string' || !snapshot.provider.trim() || snapshot.provider.trim().length > 80) throw new TypeError('Provider is required.');
  const retrievedAt = parseExchangeRateTimestamp(snapshot.retrievedAt);
  if (snapshot.provider === 'frankfurter' && snapshot.observedAt == null) throw new TypeError('Reference-rate observation date is required.');
  const observedAt = parseExchangeRateTimestamp(snapshot.observedAt ?? retrievedAt);
  const expiresAt = parseExchangeRateTimestamp(snapshot.expiresAt);
  if (expiresAt <= retrievedAt || observedAt > retrievedAt) throw new TypeError('Invalid snapshot chronology.');
  return { baseCurrency, rates: Object.freeze(rates), provider: snapshot.provider.trim(), retrievedAt, observedAt, expiresAt };
}

function mapRow(row) {
  if (!row) return null;
  return Object.freeze({ id: row.id, ...validateSnapshot({
    baseCurrency: row.base_currency, rates: row.rates, provider: row.provider,
    retrievedAt: row.retrieved_at, observedAt: row.observed_at, expiresAt: row.expires_at,
  }), freshnessState: 'fresh' });
}

// Schema management belongs exclusively to scripts/schema.sql, not request paths.
export function createExchangeRateRepository(database = db) {
  if (typeof database?.query !== 'function') throw new TypeError('Database must implement query.');
  return Object.freeze({
    async saveFreshSnapshot(snapshot) {
      const value = validateSnapshot(snapshot);
      const adapter = database;
      const result = await adapter.query(`INSERT INTO exchange_rate_snapshots (base_currency, rates, provider, retrieved_at, observed_at, expires_at) VALUES ($1, $2::jsonb, $3, $4, $5, $6) RETURNING ${columns}`, [value.baseCurrency, JSON.stringify(value.rates), value.provider, value.retrievedAt.toISOString(), value.observedAt.toISOString(), value.expiresAt.toISOString()]);
      if (!result.rows[0]) throw new Error('Snapshot was not returned after persistence.');
      return mapRow(result.rows[0]);
    },
    async findLatestSnapshot(baseCurrency) {
      const currency = normalizeCurrency(baseCurrency);
      const adapter = database;
      const result = await adapter.query(`SELECT ${columns} FROM exchange_rate_snapshots WHERE base_currency = $1 ${ordering}`, [currency]);
      return mapRow(result.rows[0]);
    },
    async findLatestUsableSnapshot(baseCurrency, currentTime = new Date()) {
      const currency = normalizeCurrency(baseCurrency);
      const timestamp = parseExchangeRateTimestamp(currentTime).toISOString();
      const adapter = database;
      const result = await adapter.query(`SELECT ${columns} FROM exchange_rate_snapshots WHERE base_currency = $1 AND retrieved_at <= $2 AND expires_at > $2 ${ordering}`, [currency, timestamp]);
      return mapRow(result.rows[0]);
    },
  });
}

export const exchangeRateRepository = createExchangeRateRepository();
