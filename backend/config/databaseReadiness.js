import db from './db.js';
import { inspectIndexes } from './indexes.js';

export const REQUIRED_SCHEMA = Object.freeze({
  users: 'id name email password role created_at',
  cars: 'id name brand make model vin type category year price mileage color condition transmission fuel_type status is_available image_url description created_at updated_at',
  car_specs: 'id car_id power engine drive created_at updated_at',
  car_images: 'id car_id image_url image_type created_at',
  bookings: 'id user_id car_id booking_date time_slot notes status created_at updated_at',
  financing_leads: 'id reference_code idempotency_key car_id user_id customer_name customer_phone customer_whatsapp customer_email vehicle_price_snapshot down_payment loan_amount annual_interest_rate loan_term_months monthly_payment total_payment total_interest currency status contact_consent consented_at created_at updated_at last_contacted_at converted_at admin_notes deleted_at deleted_by deletion_reason',
  exchange_rate_snapshots: 'id base_currency rates provider retrieved_at observed_at expires_at created_at',
  vehicle_spotlights: 'id car_id score tier reason is_read tagged_at',
});

export async function inspectDatabaseReadiness(database = db) {
  const names = Object.keys(REQUIRED_SCHEMA);
  const result = await database.query(`SELECT c.relname AS table_name,
    a.attname AS column_name,
    has_table_privilege(c.oid, 'SELECT') AND has_table_privilege(c.oid, 'INSERT')
      AND has_table_privilege(c.oid, 'UPDATE') AND has_table_privilege(c.oid, 'DELETE') AS writable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY($1::text[])`, [names]);
  const columns = new Map();
  const permissions = new Set();
  for (const row of result.rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name).add(row.column_name);
    if (!row.writable) permissions.add(row.table_name);
  }
  const missingTables = names.filter(name => !columns.has(name));
  const missingColumns = names.flatMap(name => columns.has(name)
    ? REQUIRED_SCHEMA[name].split(' ').filter(column => !columns.get(name).has(column)).map(column => `${name}.${column}`) : []);
  const missingPrivileges = [...permissions];
  const { missing: missingIndexes } = await inspectIndexes(database);
  return { ready: ![missingTables, missingColumns, missingPrivileges, missingIndexes].some(items => items.length),
    missingTables, missingColumns, missingPrivileges, missingIndexes };
}
