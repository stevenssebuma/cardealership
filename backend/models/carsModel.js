import db from "../config/db.js";

function mapCar(row) {
  return { ...row, brand: row.make };
}

export async function getAllCars(filters = {}) {
  const values = [];
  const clauses = [];
  const add = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  };
  if (filters.make) add("LOWER(c.make) = LOWER(?)", filters.make);
  if (filters.type) add("LOWER(c.type) = LOWER(?)", filters.type);
  if (filters.category) add("LOWER(c.category) = LOWER(?)", filters.category);
  if (filters.year) add("c.year = ?", Number(filters.year));
  if (filters.minPrice) add("c.price >= ?", Number(filters.minPrice));
  if (filters.maxPrice) add("c.price <= ?", Number(filters.maxPrice));
  const result = await db.query(
    `SELECT c.*, COALESCE(json_agg(json_build_object('id', ci.id, 'url', ci.image_url, 'type', ci.image_type)) FILTER (WHERE ci.id IS NOT NULL), '[]') AS images FROM cars c LEFT JOIN car_images ci ON ci.car_id = c.id ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`,
    values,
  );
  return result.rows.map(mapCar);
}

export async function getCarById(id) {
  const car = await db.query(
    `SELECT c.*, cs.power, cs.engine, cs.drive FROM cars c LEFT JOIN car_specs cs ON cs.car_id = c.id WHERE c.id = $1`,
    [id],
  );
  const images = await db.query(
    `SELECT image_url FROM car_images WHERE car_id = $1 ORDER BY is_primary DESC, id`,
    [id],
  );
  return { car: car.rows[0] ? mapCar(car.rows[0]) : null, images: images.rows };
}

export async function createCar(data) {
  const result = await db.query(
    `INSERT INTO cars (name, make, model, type, category, year, price, description, condition, mileage, color, vin, status, is_available) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE) RETURNING id`,
    [
      data.name,
      data.brand ?? data.make,
      data.model ?? null,
      data.type ?? null,
      data.category ?? null,
      data.year,
      data.price,
      data.description ?? null,
      data.condition ?? "New",
      data.mileage ?? null,
      data.color ?? null,
      data.vin ?? null,
      data.status ?? "Available",
    ],
  );
  const carId = result.rows[0].id;
  if (data.power || data.engine || data.drive)
    await db.query(
      `INSERT INTO car_specs (car_id, power, engine, drive) VALUES ($1,$2,$3,$4)`,
      [carId, data.power ?? null, data.engine ?? null, data.drive ?? null],
    );
  return carId;
}

const permitted = [
  "name",
  "make",
  "brand",
  "model",
  "type",
  "category",
  "year",
  "price",
  "description",
  "condition",
  "mileage",
  "color",
  "vin",
  "status",
  "is_available",
];
export async function updateCar(id, values) {
  const entries = Object.entries(values)
    .filter(([key, value]) => permitted.includes(key) && value !== undefined)
    .map(([key, value]) => [key === "brand" ? "make" : key, value]);
  if (!entries.length) return null;
  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`);
  const result = await db.query(
    `UPDATE cars SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...entries.map(([, value]) => value)],
  );
  return result.rows[0] ? mapCar(result.rows[0]) : null;
}

export async function deleteCar(id) {
  const result = await db.query(`DELETE FROM cars WHERE id = $1 RETURNING id`, [
    id,
  ]);
  return result.rows[0] || null;
}

export async function saveCarImage(carId, imageUrl, imageType = "general") {
  const result = await db.query(
    `INSERT INTO car_images (car_id, image_url, image_type) VALUES ($1, $2, $3) RETURNING id, car_id, image_url, image_type`,
    [carId, imageUrl, imageType],
  );
  return result.rows[0];
}
