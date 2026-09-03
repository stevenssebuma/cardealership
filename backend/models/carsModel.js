import db from "../config/db.js";

/*
|--------------------------------------------------------------------------
| DEAL PRICING METRICS
|--------------------------------------------------------------------------
|
| These SQL expressions give the pricing engine the data it needs:
|
| - listing age;
| - total historical views;
| - recent 30-day views;
| - previous price;
| - peer median price for similar vehicles.
|
*/

const DEAL_METRICS_SQL = `
  GREATEST(
    0,
    FLOOR(
      EXTRACT(
        EPOCH FROM (
          NOW() - c.created_at
        )
      ) / 86400
    )
  )::int AS days_listed,

  (
    SELECT COUNT(*)::int
    FROM car_views cv
    WHERE cv.car_id = c.id
  ) AS total_views,

  (
    SELECT COUNT(*)::int
    FROM car_views cv
    WHERE cv.car_id = c.id
      AND cv.viewed_at >= NOW() - INTERVAL '30 days'
  ) AS views_last_30_days,

  (
    SELECT cph.old_price
    FROM car_price_history cph
    WHERE cph.car_id = c.id
    ORDER BY
      cph.changed_at DESC,
      cph.id DESC
    LIMIT 1
  ) AS previous_price,

  (
    SELECT
      percentile_cont(0.5)
      WITHIN GROUP (
        ORDER BY peer.price
      )
    FROM cars peer
    WHERE peer.brand = c.brand
      AND peer.id <> c.id
      AND peer.year BETWEEN c.year - 1 AND c.year + 1
      AND COALESCE(peer.is_available, TRUE) = TRUE
  ) AS peer_median_price
`;

/*
|--------------------------------------------------------------------------
| GET ALL CARS
|--------------------------------------------------------------------------
*/

export const getAllCars = async () => {
  const carsQuery = `
    SELECT
      c.*,

      COALESCE(
        json_agg(
          json_build_object(
            'id', ci.id,
            'url', ci.image_url,
            'type', ci.image_type
          )
        ) FILTER (
          WHERE ci.id IS NOT NULL
        ),
        '[]'
      ) AS images,

      (
        SELECT ci2.image_url
        FROM car_images ci2
        WHERE ci2.car_id = c.id
          AND ci2.image_type = 'primary'
        ORDER BY ci2.id ASC
        LIMIT 1
      ) AS primary_image,

      ${DEAL_METRICS_SQL}

    FROM cars c

    LEFT JOIN car_images ci
      ON ci.car_id = c.id

    GROUP BY c.id

    ORDER BY c.created_at DESC

    LIMIT 20;
  `;

  const result = await db.query(carsQuery);

  return result.rows;
};

/*
|--------------------------------------------------------------------------
| GET SINGLE CAR
|--------------------------------------------------------------------------
*/

export const getCarById = async (id) => {
  const carQuery = `
    SELECT
      c.*,

      cs.power,
      cs.engine,
      cs.drive,

      ${DEAL_METRICS_SQL}

    FROM cars c

    LEFT JOIN car_specs cs
      ON c.id = cs.car_id

    WHERE c.id = $1;
  `;

  const imagesQuery = `
    SELECT
      id,
      image_url,
      image_type,
      is_primary

    FROM car_images

    WHERE car_id = $1

    ORDER BY
      is_primary DESC,
      id ASC;
  `;

  const car = await db.query(carQuery, [id]);

  const images = await db.query(imagesQuery, [id]);

  return {
    car: car.rows[0],

    images: images.rows,
  };
};

/*
|--------------------------------------------------------------------------
| RECORD VEHICLE VIEW
|--------------------------------------------------------------------------
|
| Every time a customer opens a vehicle details page, a view can be
| persisted here.
|
| viewerId may be null for public/anonymous visitors.
|
*/

export const recordCarView = async (carId, viewerId = null) => {
  const query = `
    INSERT INTO car_views (
      car_id,
      viewer_id
    )

    VALUES (
      $1,
      $2
    )

    RETURNING
      id,
      car_id,
      viewer_id,
      viewed_at;
  `;

  const result = await db.query(query, [carId, viewerId]);

  return result.rows[0];
};

/*
|--------------------------------------------------------------------------
| GET VEHICLE VIEW ANALYTICS
|--------------------------------------------------------------------------
*/

export const getCarViewAnalytics = async (carId) => {
  const query = `
    SELECT

      COUNT(*)::int
        AS total_views,

      COUNT(*) FILTER (
        WHERE viewed_at >=
          NOW() - INTERVAL '30 days'
      )::int
        AS views_last_30_days,

      COUNT(*) FILTER (
        WHERE viewed_at >=
          NOW() - INTERVAL '7 days'
      )::int
        AS views_last_7_days

    FROM car_views

    WHERE car_id = $1;
  `;

  const result = await db.query(query, [carId]);

  return result.rows[0];
};

/*
|--------------------------------------------------------------------------
| UPDATE CAR PRICE + PRICE HISTORY
|--------------------------------------------------------------------------
|
| Updates the current selling price while preserving the previous value
| in car_price_history.
|
| Transaction guarantees that either BOTH operations succeed or neither
| operation succeeds.
|
*/

export const updateCarPrice = async ({ carId, newPrice, changedBy = null }) => {
  const client = await db.connect?.();

  /*
  |--------------------------------------------------------------------------
  | Compatibility
  |--------------------------------------------------------------------------
  |
  | Your db wrapper may expose only query().
  |
  | If connect() is unavailable, use a safe SQL transaction through query().
  |
  */

  if (!client) {
    await db.query("BEGIN");

    try {
      const currentResult = await db.query(
        `
            SELECT
              id,
              price
            FROM cars
            WHERE id = $1
            FOR UPDATE;
          `,
        [carId],
      );

      if (currentResult.rows.length === 0) {
        await db.query("ROLLBACK");

        return null;
      }

      const oldPrice = Number(currentResult.rows[0].price);

      await db.query(
        `
          INSERT INTO car_price_history (
            car_id,
            old_price,
            new_price,
            changed_by
          )

          VALUES (
            $1,
            $2,
            $3,
            $4
          );
        `,
        [carId, oldPrice, newPrice, changedBy],
      );

      const updatedResult = await db.query(
        `
            UPDATE cars

            SET
              price = $2,
              updated_at = NOW()

            WHERE id = $1

            RETURNING
              id,
              name,
              brand,
              year,
              price,
              updated_at;
          `,
        [carId, newPrice],
      );

      await db.query("COMMIT");

      return {
        oldPrice,

        car: updatedResult.rows[0],
      };
    } catch (error) {
      await db.query("ROLLBACK");

      throw error;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Pool-client transaction
  |--------------------------------------------------------------------------
  */

  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `
          SELECT
            id,
            price
          FROM cars
          WHERE id = $1
          FOR UPDATE;
        `,
      [carId],
    );

    if (currentResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return null;
    }

    const oldPrice = Number(currentResult.rows[0].price);

    await client.query(
      `
        INSERT INTO car_price_history (
          car_id,
          old_price,
          new_price,
          changed_by
        )

        VALUES (
          $1,
          $2,
          $3,
          $4
        );
      `,
      [carId, oldPrice, newPrice, changedBy],
    );

    const updatedResult = await client.query(
      `
          UPDATE cars

          SET
            price = $2,
            updated_at = NOW()

          WHERE id = $1

          RETURNING
            id,
            name,
            brand,
            year,
            price,
            updated_at;
        `,
      [carId, newPrice],
    );

    await client.query("COMMIT");

    return {
      oldPrice,

      car: updatedResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
};

/*
|--------------------------------------------------------------------------
| GET PRICE HISTORY
|--------------------------------------------------------------------------
*/

export const getCarPriceHistory = async (carId) => {
  const query = `
    SELECT
      id,
      car_id,
      old_price,
      new_price,
      changed_by,
      changed_at

    FROM car_price_history

    WHERE car_id = $1

    ORDER BY
      changed_at DESC,
      id DESC;
  `;

  const result = await db.query(query, [carId]);

  return result.rows;
};

/*
|--------------------------------------------------------------------------
| CREATE CAR
|--------------------------------------------------------------------------
*/

export const createCar = async (data) => {
  const {
    name,
    brand,
    type,
    category,
    year,
    price,
    power,
    engine,
    drive,
    images,
  } = data;

  const carInsert = `
    INSERT INTO cars (
      name,
      brand,
      type,
      category,
      year,
      price
    )

    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6
    )

    RETURNING id;
  `;

  const carResult = await db.query(carInsert, [
    name,
    brand,
    type,
    category,
    year,
    price,
  ]);

  const carId = carResult.rows[0].id;

  // specs
  await db.query(
    `
      INSERT INTO car_specs (
        car_id,
        power,
        engine,
        drive
      )

      VALUES (
        $1,
        $2,
        $3,
        $4
      )
    `,
    [carId, power, engine, drive],
  );

  // images
  if (images && images.length > 0) {
    for (let i = 0; i < images.length; i += 1) {
      await db.query(
        `
          INSERT INTO car_images (
            car_id,
            image_url,
            is_primary
          )

          VALUES (
            $1,
            $2,
            $3
          )
        `,
        [carId, images[i], i === 0],
      );
    }
  }

  return carId;
};

/*
|--------------------------------------------------------------------------
| SAVE CAR IMAGE
|--------------------------------------------------------------------------
*/

export const saveCarImage = async (carId, imageUrl, imageType = "general") => {
  const query = `
    INSERT INTO car_images (
      car_id,
      image_url,
      image_type
    )

    VALUES (
      $1,
      $2,
      $3
    )

    RETURNING
      id,
      car_id,
      image_url,
      image_type;
  `;

  const result = await db.query(query, [carId, imageUrl, imageType]);

  return result.rows[0];
};

/*
|--------------------------------------------------------------------------
| EXISTING IMAGE CLEANUP LOGIC
|--------------------------------------------------------------------------
*/

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

        AND c.${safeTimestampField} <
          NOW() -
          ($3::int * INTERVAL '1 day')

      RETURNING
        ci.id,
        ci.car_id,
        ci.image_url;
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

        AND c.${safeTimestampField} <
          NOW() -
          ($3::int * INTERVAL '1 day')

      RETURNING
        ci.id,
        ci.car_id,
        ci.image_url;
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
