import db from './db.js';

// Canonical schema.sql owns DDL. This module verifies real catalog state,
// and intentionally never fabricates success or creates indexes on import.
export const REQUIRED_INDEXES = Object.freeze([
  'users_email_lower_unique_idx','cars_vin_unique_idx','cars_make_model_idx',
  'idx_cars_make','idx_cars_model','idx_cars_price','cars_year_idx',
  'bookings_car_date_index','bookings_date_status_idx','uniq_booking',
  'exchange_rate_latest_snapshot','exchange_rate_expiry_lookup',
  'vehicle_spotlights_score_idx','vehicle_spotlights_unread_idx',
  'cars_status_idx','cars_created_at_index','car_images_car_id_idx',
  'bookings_user_id_idx','bookings_status_index',
  'financing_leads_status_created_idx','financing_leads_active_status_created_idx',
  'financing_leads_car_id_idx','financing_leads_user_id_idx',
]);
export async function inspectIndexes(database = db) {
  const result = await database.query(`SELECT i.relname AS indexname
    FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class i ON i.oid=x.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=i.relnamespace
    WHERE n.nspname='public' AND x.indisvalid AND x.indisready AND i.relname=ANY($1::text[])`, [REQUIRED_INDEXES]);
  const present = new Set(result.rows.map(r=>r.indexname));
  const missing = REQUIRED_INDEXES.filter(name=>!present.has(name));
  return { verified:missing.length===0,missing };
}
export async function verifyIndexes(database = db) {
  const result = await inspectIndexes(database);
  if (!result.verified) throw Object.assign(new Error('Required PostgreSQL indexes missing; apply the approved schema migration.'), { code:'INDEXES_MISSING',missing:result.missing });
  return true;
}
// Legacy entry point now verifies the provisioned schema instead of
// pretending to create indexes; explicit schema provisioning is P5.
export const createIndexes = verifyIndexes;
