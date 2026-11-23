import db from '../config/db.js';
import { mapCarRow } from '../utils/databaseRows.js';
import { VALID_TIME_SLOTS } from '../utils/validators.js';

const PUBLIC_STATUS = "lower(status) IN ('available','pending test drive','reserved','sold')";
const SORT = Object.freeze({ price: 'price', year: 'year', make: 'make', model: 'model', createdAt: 'created_at' });
const num = value => Number(value ?? 0);
const bad = message => Object.assign(new Error(message), { code: 'INVALID_QUERY' });
const integer = (value, min, max, label) => {
  if (!['string','number'].includes(typeof value) || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw bad(`Invalid ${label}.`);
  return Number(value);
};
const money = (value, label) => {
  if (!['string','number'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value)) || Number(value) > 999999999999.99) throw bad(`Invalid ${label}.`);
  return Number(value);
};
const words = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) throw bad(`Invalid ${label}.`);
  return value.trim();
};
const day = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw bad('Invalid date.');
  return value;
};
export const vehicleRow = row => ({ ...mapCarRow(row), fuelType: row.fuel_type ?? null, createdAt: row.created_at, updatedAt: row.updated_at });
const unknownMake = "COALESCE(NULLIF(make,''), NULLIF(brand,''), 'Unknown')";

export function createAnalyticsRepository(database = db) {
  if (typeof database?.query !== 'function') throw new TypeError('Database query adapter required.');
  async function searchInventory(params = {}) {
    const { sortBy = 'price', sortOrder = 'asc', limit = 20, offset = 0 } = params;
    if (typeof sortBy !== 'string' || !Object.hasOwn(SORT, sortBy) || !['asc','desc'].includes(sortOrder)) throw bad('Invalid sort order.');
    const pageLimit = integer(limit, 1, 100, 'limit');
    const pageOffset = integer(offset, 0, 1000000, 'offset');
    const values = [];
    const bind = value => { values.push(value); return `$${values.length}`; };
    const where = [PUBLIC_STATUS];
    for (const [field,column] of [['make',unknownMake],['model','model']]) {
      if (params[field] !== undefined) where.push(`strpos(lower(COALESCE(${column},'')),lower(${bind(words(params[field],field))})) > 0`);
    }
    for (const [field,column] of [['condition','condition'],['transmission','transmission'],['fuelType','fuel_type']]) {
      if (params[field] !== undefined) where.push(`lower(${column})=lower(${bind(words(params[field],field))})`);
    }
    if (params.year !== undefined) where.push(`year=${bind(integer(params.year,1886,9999,'year'))}`);
    const min = params.minPrice === undefined ? null : money(params.minPrice,'minPrice');
    const max = params.maxPrice === undefined ? null : money(params.maxPrice,'maxPrice');
    if (min !== null && max !== null && min > max) throw bad('minPrice exceeds maxPrice.');
    if (min !== null) where.push(`price >= ${bind(min)}`);
    if (max !== null) where.push(`price <= ${bind(max)}`);
    // SQL identifiers/direction come only from the fixed allowlist above.
    const sort = `${SORT[sortBy]} ${sortOrder.toUpperCase()} NULLS LAST, id ASC`;
    const limitParam = bind(pageLimit), offsetParam = bind(pageOffset);
    const result = await database.query(`WITH filtered AS (
      SELECT id, name, brand, ${unknownMake} AS make, model, year, price, condition, transmission, fuel_type, mileage, color, status, created_at, updated_at
      FROM cars WHERE ${where.join(' AND ')}
    ), page AS (SELECT * FROM filtered ORDER BY ${sort} LIMIT ${limitParam} OFFSET ${offsetParam})
    SELECT (SELECT count(*) FROM filtered) AS total, COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY ${sort}) FROM page), '[]'::jsonb) AS data`, values);
    const row = result.rows[0];
    return { data: row.data.map(vehicleRow), total: num(row.total), limit: pageLimit, offset: pageOffset };
  }
  async function availability(carId, date, timeSlot) {
    const id = integer(carId,1,2147483647,'carId');
    if (!VALID_TIME_SLOTS.includes(timeSlot)) throw bad('Invalid timeSlot.');
    const result = await database.query(`SELECT EXISTS(SELECT 1 FROM cars WHERE id=$1 AND ${PUBLIC_STATUS}) AS present,
      EXISTS(SELECT 1 FROM bookings WHERE car_id=$1 AND booking_date=$2 AND time_slot=$3
       AND status NOT IN ('cancelled','completed')) AS booked`, [id,day(date),timeSlot]);
    const { present, booked } = result.rows[0];
    // Never disclose another customer's identity on a public availability endpoint.
    return { present, available: present && !booked, bookedBy: null };
  }
  async function inventoryStats({ publicOnly = false } = {}) {
    const filter = publicOnly ? `WHERE ${PUBLIC_STATUS}` : '';
    const [summary, grouped, byYear, byCondition, recent] = await Promise.all([
      database.query(`SELECT count(*) AS count, sum(price) AS total, avg(price) AS average, min(price) AS min, max(price) AS max FROM cars ${filter}`),
      database.query(`SELECT ${unknownMake} AS make, count(*) AS count, sum(price) AS total, avg(price) AS average FROM cars ${filter} GROUP BY 1 ORDER BY count(*) DESC, 1`),
      database.query(`SELECT year AS _id, count(*) AS count, sum(price) AS "totalValue" FROM cars ${filter} GROUP BY year ORDER BY year DESC NULLS LAST LIMIT 10`),
      database.query(`SELECT condition AS _id, count(*) AS count, avg(price) AS "avgPrice" FROM cars ${filter} GROUP BY condition ORDER BY condition`),
      database.query(`SELECT ${unknownMake} AS make, model, year, price, condition FROM cars ${filter} ORDER BY created_at DESC,id DESC LIMIT 5`),
    ]);
    const s = summary.rows[0];
    return { totalCars: num(s.count), totalValue: num(s.total), averagePrice: num(s.average), minPrice: num(s.min), maxPrice: num(s.max),
      byMake: Object.fromEntries(grouped.rows.map(r => [r.make,{ count:num(r.count), totalValue:num(r.total) }])),
      byYear: byYear.rows.map(r => ({ ...r,count:num(r.count),totalValue:num(r.totalValue) })),
      byCondition: byCondition.rows.map(r => ({ ...r,count:num(r.count),avgPrice:num(r.avgPrice) })), recent: recent.rows.map(mapCarRow) };
  }
  async function bookingMetrics() {
    const [summary, byCar, daily, upcoming] = await Promise.all([
      database.query(`SELECT count(*) AS total, count(*) FILTER (WHERE status='confirmed') AS confirmed,
        count(*) FILTER (WHERE status='cancelled') AS cancelled, count(*) FILTER (WHERE status='completed') AS completed,
        count(*) FILTER (WHERE booking_date >= date_trunc('month', CURRENT_DATE)::date AND booking_date < (date_trunc('month', CURRENT_DATE)+interval '1 month')::date) AS "thisMonth" FROM bookings`),
      database.query(`SELECT COALESCE(NULLIF(c.name,''),'Unknown') AS name,count(*) AS count FROM bookings b JOIN cars c ON c.id=b.car_id GROUP BY 1 ORDER BY 2 DESC,1`),
      database.query(`SELECT booking_date::text AS _id, count(*) AS count,count(*) FILTER (WHERE status='confirmed') AS confirmed FROM bookings WHERE booking_date >= CURRENT_DATE-29 AND booking_date <= CURRENT_DATE GROUP BY booking_date ORDER BY booking_date DESC`),
      database.query(`SELECT b.id,b.car_id AS "carId",c.name AS "carModel",b.booking_date::text AS date,b.time_slot AS "timeSlot",b.status FROM bookings b JOIN cars c ON c.id=b.car_id WHERE b.booking_date>=CURRENT_DATE AND b.status='confirmed' ORDER BY b.booking_date,b.time_slot,b.id LIMIT 10`),
    ]);
    return { ...Object.fromEntries(Object.entries(summary.rows[0]).map(([k,v])=>[k,num(v)])), byCar:Object.fromEntries(byCar.rows.map(r=>[r.name,num(r.count)])), daily:daily.rows.map(r=>({...r,count:num(r.count),confirmed:num(r.confirmed)})), upcoming:upcoming.rows };
  }
  async function userMetrics() {
    const [summary,grouped] = await Promise.all([
      database.query(`SELECT count(*) AS total, count(*) FILTER (WHERE created_at>=CURRENT_TIMESTAMP-interval '30 days') AS new_users,
        count(*) FILTER (WHERE EXISTS(SELECT 1 FROM bookings b WHERE b.user_id=users.id)) AS active_users FROM users`),
      database.query('SELECT role,count(*) AS count FROM users GROUP BY role ORDER BY role'),
    ]);
    const row = summary.rows[0];
    return { totalUsers:num(row.total), newUsers:num(row.new_users), activeUsers:num(row.active_users), byRole:Object.fromEntries(grouped.rows.map(r=>[r.role,num(r.count)])) };
  }
  async function listInventory() {
    return (await database.query('SELECT * FROM cars ORDER BY id')).rows.map(vehicleRow);
  }
  async function getBookingsByDateRange(startDate,endDate,status = null) {
    const start = day(startDate), end = day(endDate);
    if (start > end || (status !== null && !['pending','confirmed','completed','cancelled'].includes(status))) throw bad('Invalid booking range or status.');
    return (await database.query(`SELECT b.id,b.user_id AS "userId",b.car_id AS "carId",c.name AS "carModel",b.booking_date::text AS date,b.time_slot AS "timeSlot",b.status,b.created_at AS "createdAt"
      FROM bookings b JOIN cars c ON c.id=b.car_id WHERE b.booking_date BETWEEN $1 AND $2 AND ($3::text IS NULL OR b.status=$3) ORDER BY b.booking_date,b.time_slot,b.id`,[start,end,status])).rows;
  }
  async function getMonthlyBookingStats(year,month) {
    const y = integer(year,1900,9999,'year'), m = integer(month,1,12,'month');
    return (await database.query(`SELECT to_char(booking_date,'DD') AS _id,count(*) AS total,count(*) FILTER (WHERE status='confirmed') AS confirmed,count(*) FILTER (WHERE status='cancelled') AS cancelled
      FROM bookings WHERE booking_date>=make_date($1,$2,1) AND booking_date<make_date($1,$2,1)+interval '1 month' GROUP BY booking_date ORDER BY booking_date`,[y,m])).rows.map(r=>({...r,total:num(r.total),confirmed:num(r.confirmed),cancelled:num(r.cancelled)}));
  }
  // Main has no authoritative sales or search-event producer. Do not present
  // listing prices or sample events as actual sales/revenue/search telemetry.
  const revenueMetrics = () => ({ available:false,totalRevenue:null,totalSales:null,averageSale:null,reason:'NO_AUTHORITATIVE_SALES_SOURCE' });
  const searchMetrics = () => ({ available:false,mostSearchedMakes:[],dailyTrends:[],total:null,reason:'NO_AUTHORITATIVE_SEARCH_SOURCE' });
  return Object.freeze({ searchInventory,availability,inventoryStats,bookingMetrics,userMetrics,listInventory,getBookingsByDateRange,getMonthlyBookingStats,revenueMetrics,searchMetrics });
}
export const analyticsRepository = createAnalyticsRepository();
