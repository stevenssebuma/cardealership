import db from "../config/db.js";
import { mapCarRow } from "../utils/databaseRows.js";

// GET ALL CARS

const parseImages = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

export const getAllCars = async () => {
  const result = await db.query(`
    SELECT
      c.*,
      cs.power,
      cs.engine,
      cs.drive,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', ci.id,
          'url', ci.image_url,
          'type', ci.image_type
        ) ORDER BY ci.id)
        FROM car_images ci
        WHERE ci.car_id = c.id
      ), '[]'::jsonb) AS images,
      (
        SELECT ci.image_url
        FROM car_images ci
        WHERE ci.car_id = c.id AND ci.image_type = 'primary'
        ORDER BY ci.id ASC
        LIMIT 1
      ) AS primary_image
    FROM cars c
    LEFT JOIN car_specs cs ON cs.car_id = c.id
    ORDER BY c.created_at DESC
    LIMIT 20;
  `);

  return result.rows.map((car) => ({
    ...mapCarRow(car),
    images: parseImages(car.images),
  }));
};

// GET SINGLE CAR

export const getCarById = async (id, database = db) => {
  const car = await database.query(`
    SELECT
      c.*,
      cs.power,
      cs.engine,
      cs.drive
    FROM cars c
    LEFT JOIN car_specs cs ON c.id = cs.car_id
    WHERE c.id = $1;
  `, [id]);

  const images = await database.query(`
    SELECT id, image_url, image_type
    FROM car_images
    WHERE car_id = $1
    ORDER BY id ASC;
  `, [id]);

  return {
    car: mapCarRow(car.rows[0]),
    images: images.rows,
  };
};

// CREATE CAR

export const createCar = async (data) => {
  const {
    vin,
    make,
    model,
    name,
    type,
    category,
    year,
    price,
    mileage,
    color,
    condition,
    status,
    description,
    transmission,
    fuelType,
    power,
    engine,
    drive,
    images = [],
  } = data;

  return db.withTransaction(async (tx) => {
    const carInsert = `
      INSERT INTO cars (
        vin,
        make,
        brand,
        model,
        name,
        type,
        category,
        year,
        price,
        mileage,
        color,
        condition,
        status,
        description,
        transmission,
        fuel_type
      )
      VALUES (
        $1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      )
      RETURNING id;
    `;

    const carResult = await tx.query(carInsert, [
      vin,
      make,
      model,
      name,
      type,
      category,
      year,
      price,
      mileage,
      color,
      condition,
      status ?? "available",
      description ?? null,
      transmission ?? null,
      fuelType ?? null,
    ]);

    const carId = carResult.rows[0].id;

    await tx.query(
      `
        INSERT INTO car_specs (
          car_id,
          power,
          engine,
          drive
        )
        VALUES ($1,$2,$3,$4);
      `,
      [carId, power, engine, drive],
    );

    if (Array.isArray(images) && images.length > 0) {
      for (let i = 0; i < images.length; i += 1) {
        const image = images[i];

        if (typeof image !== "string" || image.trim() === "") {
          continue;
        }

        await tx.query(
          `
            INSERT INTO car_images (
              car_id,
              image_url,
              image_type
            )
            VALUES ($1,$2,$3);
          `,
          [carId, image.trim(), i === 0 ? "primary" : "general"],
        );
      }
    }

    return carId;
  });
};

// UPDATE CAR

export const updateCar = async (id, data) => {
  const allowedCarFields = [
    "vin",
    "make",
    "model",
    "name",
    "type",
    "category",
    "year",
    "price",
    "mileage",
    "color",
    "condition",
    "status",
    "description",
    "transmission",
  ];

  const specFields = ["power", "engine", "drive"];

  const carEntries = Object.entries(data).filter(
    ([field, value]) => allowedCarFields.includes(field) && value !== undefined,
  );
  if (data.make !== undefined) carEntries.push(["brand", data.make]);
  if (data.fuelType !== undefined) carEntries.push(["fuel_type", data.fuelType]);

  const specEntries = Object.entries(data).filter(
    ([field, value]) => specFields.includes(field) && value !== undefined,
  );

  return db.withTransaction(async (tx) => {
    const existing = await tx.query(`SELECT id FROM cars WHERE id = $1 FOR UPDATE;`, [id]);

    if (existing.rowCount === 0) {
      return null;
    }

    if (carEntries.length > 0) {
      const assignments = carEntries.map(
        ([field], index) => `${field} = $${index + 1}`,
      );

      const values = carEntries.map(([, value]) => value);

      values.push(id);

      await tx.query(
        `
          UPDATE cars
          SET
            ${assignments.join(", ")},
            updated_at = NOW()
          WHERE id = $${values.length};
        `,
        values,
      );
    }

    if (specEntries.length > 0) {
      const currentSpecs = await tx.query(
        `
          SELECT power, engine, drive
          FROM car_specs
          WHERE car_id = $1;
        `,
        [id],
      );

      const current = currentSpecs.rows[0] ?? {};

      const nextSpecs = {
        power: data.power !== undefined ? data.power : (current.power ?? ""),
        engine:
          data.engine !== undefined ? data.engine : (current.engine ?? ""),
        drive: data.drive !== undefined ? data.drive : (current.drive ?? ""),
      };

      if (currentSpecs.rowCount > 0) {
        await tx.query(
          `
            UPDATE car_specs
            SET
              power = $1,
              engine = $2,
              drive = $3,
              updated_at = CURRENT_TIMESTAMP
            WHERE car_id = $4;
          `,
          [nextSpecs.power, nextSpecs.engine, nextSpecs.drive, id],
        );
      } else {
        await tx.query(
          `
            INSERT INTO car_specs (
              car_id,
              power,
              engine,
              drive
            )
            VALUES ($1, $2, $3, $4);
          `,
          [id, nextSpecs.power, nextSpecs.engine, nextSpecs.drive],
        );
      }
    }

    return getCarById(id, tx);
  });
};

// DELETE CAR

export const deleteCar = async (id) => {
  return db.withTransaction(async (tx) => {
    const existing = await tx.query(
      `
        SELECT id, name
        FROM cars
        WHERE id = $1 FOR UPDATE;
      `,
      [id],
    );

    if (existing.rowCount === 0) {
      return null;
    }

    await tx.query(`DELETE FROM car_images WHERE car_id = $1;`, [id]);

    await tx.query(`DELETE FROM car_specs WHERE car_id = $1;`, [id]);

    const result = await tx.query(
      `
        DELETE FROM cars
        WHERE id = $1
        RETURNING id, name;
      `,
      [id],
    );

    return result.rows[0];
  });
};

// SAVE CAR IMAGE

export const saveCarImage = async (carId, imageUrl, imageType = "general", database = db) => {
  const query = `
    INSERT INTO car_images (
      car_id,
      image_url,
      image_type
    )
    VALUES ($1, $2, $3)
    RETURNING id, car_id, image_url, image_type;
  `;

  const result = await database.query(query, [carId, imageUrl, imageType]);

  return result.rows[0];
};

const SAFE_CLEANUP_TIMESTAMP_FIELDS = [
  "deleted_at",
  "drafted_at",
  "updated_at",
  "created_at",
];

const DEFAULT_CLEANUP_STATUSES = ["Draft", "Deleted", "draft", "deleted"];

function normalizeCleanupStatuses(statuses = DEFAULT_CLEANUP_STATUSES) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return DEFAULT_CLEANUP_STATUSES;
  }

  return statuses
    .filter((status) => typeof status === "string")
    .map((status) => status.trim())
    .filter(Boolean);
}

function normalizeCleanupOlderThanDays(value, fallback = 30) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

function normalizeCleanupTimestampField(field = "created_at") {
  if (SAFE_CLEANUP_TIMESTAMP_FIELDS.includes(field)) {
    return field;
  }

  return "created_at";
}

export const deleteCarImageRecordById = async ({
  imageId,
  statuses = DEFAULT_CLEANUP_STATUSES,
  olderThanDays = 30,
  timestampField = "created_at",
} = {}) => {
  const safeTimestampField = normalizeCleanupTimestampField(timestampField);

  const safeStatuses = normalizeCleanupStatuses(statuses);

  const safeOlderThanDays = normalizeCleanupOlderThanDays(olderThanDays);

  const query = `
    DELETE FROM car_images ci
    USING cars c
    WHERE ci.id = $1
      AND ci.car_id = c.id
      AND c.status = ANY($2)
      AND c.${safeTimestampField} < NOW() - ($3::int * INTERVAL '1 day')
    RETURNING ci.id, ci.car_id, ci.image_url;
  `;

  const result = await db.query(query, [
    imageId,
    safeStatuses,
    safeOlderThanDays,
  ]);

  return {
    deletedCount: result.rowCount,
    deletedRecords: result.rows,
  };
};

export const deleteCarImageRecords = async ({
  carId,
  statuses = DEFAULT_CLEANUP_STATUSES,
  olderThanDays = 30,
  timestampField = "created_at",
} = {}) => {
  const safeTimestampField = normalizeCleanupTimestampField(timestampField);

  const safeStatuses = normalizeCleanupStatuses(statuses);

  const safeOlderThanDays = normalizeCleanupOlderThanDays(olderThanDays);

  const query = `
    DELETE FROM car_images ci
    USING cars c
    WHERE ci.car_id = $1
      AND ci.car_id = c.id
      AND c.status = ANY($2)
      AND c.${safeTimestampField} < NOW() - ($3::int * INTERVAL '1 day')
    RETURNING ci.id, ci.car_id, ci.image_url;
  `;

  const result = await db.query(query, [
    carId,
    safeStatuses,
    safeOlderThanDays,
  ]);

  return {
    deletedCount: result.rowCount,
    deletedRecords: result.rows,
  };
};

export const removeCarImageLinks = deleteCarImageRecords;

export const markCarImagesCleaned = async () => ({
  updatedCount: 0,
  skipped: true,
  reason: "No image cleanup marker column is currently defined for car_images.",
});


