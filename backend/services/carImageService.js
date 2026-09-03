// backend/services/carImageService.js

import sharp from "sharp";
import { Readable } from "stream";

import cloudinary from "../config/cloudinary.js";
import db from "../config/db.js";

import { getImageOptimizationConfig } from "../utils/imageOptimization.js";

const BATCH_CONCURRENCY = Number(process.env.IMAGE_BATCH_CONCURRENCY || 3);

const ALLOWED_IMAGE_TYPES = [
  "primary",
  "general",
  "front",
  "rear",
  "interior",
  "engine",
];

function normalizeImageType(imageType) {
  return ALLOWED_IMAGE_TYPES.includes(imageType) ? imageType : "general";
}

function parseCarId(carId) {
  const parsedCarId = Number(carId);

  if (!Number.isInteger(parsedCarId) || parsedCarId <= 0) {
    const error = new Error("A valid carId is required.");

    error.code = "INVALID_CAR_ID";
    error.status = 400;

    throw error;
  }

  return parsedCarId;
}

async function ensureCarExists(carId) {
  const result = await db.query(
    `
      SELECT id
      FROM cars
      WHERE id = $1
      LIMIT 1;
    `,
    [carId],
  );

  if (result.rows.length === 0) {
    const error = new Error("The requested vehicle does not exist.");

    error.code = "CAR_NOT_FOUND";
    error.status = 404;

    throw error;
  }
}

async function optimizeImageBuffer(fileBuffer) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new Error("A valid image buffer is required.");
  }

  const optimization = getImageOptimizationConfig();

  const originalMetadata = await sharp(fileBuffer).metadata();

  if (!originalMetadata.format) {
    throw new Error("Unable to determine uploaded image format.");
  }

  const optimizedBuffer = await sharp(fileBuffer)
    .rotate()
    .resize({
      width: optimization.maxWidth,
      height: optimization.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 80,
      effort: 4,
    })
    .toBuffer();

  const optimizedMetadata = await sharp(optimizedBuffer).metadata();

  const originalBytes = fileBuffer.length;
  const optimizedBytes = optimizedBuffer.length;

  const reductionPercentage =
    originalBytes > 0
      ? Number(
          (((originalBytes - optimizedBytes) / originalBytes) * 100).toFixed(2),
        )
      : 0;

  return {
    optimizedBuffer,
    originalMetadata,
    optimizedMetadata,
    optimization,
    originalBytes,
    optimizedBytes,
    reductionPercentage,
  };
}

function uploadBufferToCloudinary(fileBuffer, { folder, publicId }) {
  return new Promise((resolve, reject) => {
    const cloudinaryStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        format: "webp",
        overwrite: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(
            new Error(
              "Cloudinary completed without returning an upload result.",
            ),
          );

          return;
        }

        resolve(result);
      },
    );

    cloudinaryStream.on("error", reject);

    Readable.from(fileBuffer).pipe(cloudinaryStream);
  });
}

async function cleanupCloudinaryAsset(publicId) {
  if (!publicId) {
    return {
      attempted: false,
      deleted: false,
      result: null,
    };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);

    return {
      attempted: true,
      deleted: result?.result === "ok" || result?.result === "not found",
      result: result?.result || null,
    };
  } catch (error) {
    console.error("Cloudinary cleanup failed:", error.message);

    return {
      attempted: true,
      deleted: false,
      result: null,
      error: error.message,
    };
  }
}

async function getNextSortOrder(carId) {
  const result = await db.query(
    `
      SELECT
        COALESCE(
          MAX(sort_order),
          -1
        ) + 1 AS next_sort_order
      FROM car_images
      WHERE car_id = $1;
    `,
    [carId],
  );

  return Number(result.rows[0]?.next_sort_order ?? 0);
}

/*
|--------------------------------------------------------------------------
| SAVE CAR IMAGE RECORD
|--------------------------------------------------------------------------
|
| Important:
|
| A requested primary image is initially stored as NON-PRIMARY.
|
| This allows us to prove that:
|
| - Sharp succeeded
| - Cloudinary succeeded
| - PostgreSQL succeeded
|
| before we remove the existing primary.
|
|--------------------------------------------------------------------------
*/

async function saveCarImageRecord({
  carId,
  imageUrl,
  imageType,
  sortOrder,
  cloudinaryPublicId,
  cloudinaryFormat,
  width,
  height,
  bytes,
}) {
  const normalizedImageType = normalizeImageType(imageType);

  const storedImageType =
    normalizedImageType === "primary" ? "general" : normalizedImageType;

  const result = await db.query(
    `
      INSERT INTO car_images (
        car_id,
        image_url,
        is_primary,
        image_type,
        sort_order,
        cloudinary_public_id,
        cloudinary_format,
        width,
        height,
        bytes
      )
      VALUES (
        $1,
        $2,
        FALSE,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      )
      RETURNING
        id,
        car_id,
        image_url,
        is_primary,
        image_type,
        sort_order,
        cloudinary_public_id,
        cloudinary_format,
        width,
        height,
        bytes;
    `,
    [
      carId,
      imageUrl,
      storedImageType,
      sortOrder,
      cloudinaryPublicId,
      cloudinaryFormat,
      width,
      height,
      bytes,
    ],
  );

  return result.rows[0];
}

/*
|--------------------------------------------------------------------------
| REMOVE FAILED PRIMARY CANDIDATE
|--------------------------------------------------------------------------
*/

async function removeTemporaryImage({ imageId, carId }) {
  if (!imageId) {
    return;
  }

  try {
    await db.query(
      `
        DELETE FROM car_images
        WHERE id = $1
          AND car_id = $2
          AND is_primary = FALSE
          AND image_type <> 'primary';
      `,
      [imageId, carId],
    );
  } catch (error) {
    console.error("Temporary image database cleanup failed:", error.message);
  }
}

/*
|--------------------------------------------------------------------------
| SAFE PRIMARY IMAGE REPLACEMENT
|--------------------------------------------------------------------------
|
| Sequence:
|
| 1. The new image has already been optimized.
| 2. The new image has already reached Cloudinary.
| 3. The new image already exists in PostgreSQL as non-primary.
| 4. Lock the vehicle row.
| 5. Lock the candidate.
| 6. Find all existing primary records.
| 7. Delete the old primary records.
| 8. Promote the candidate.
| 9. Commit.
| 10. Only after commit, clean old Cloudinary assets.
|
|--------------------------------------------------------------------------
*/

async function replacePrimaryImage({ carId, newImageId }) {
  const client = await db.pool.connect();

  let removedOldPrimaries = [];
  let newPrimary = null;

  try {
    await client.query("BEGIN");

    const carResult = await client.query(
      `
        SELECT id
        FROM cars
        WHERE id = $1
        FOR UPDATE;
      `,
      [carId],
    );

    if (carResult.rows.length === 0) {
      const error = new Error("The requested vehicle does not exist.");

      error.code = "CAR_NOT_FOUND";
      error.status = 404;

      throw error;
    }

    const candidateResult = await client.query(
      `
        SELECT
          id,
          car_id,
          image_url,
          is_primary,
          image_type,
          sort_order,
          cloudinary_public_id,
          cloudinary_format,
          width,
          height,
          bytes
        FROM car_images
        WHERE id = $1
          AND car_id = $2
        FOR UPDATE;
      `,
      [newImageId, carId],
    );

    if (candidateResult.rows.length === 0) {
      const error = new Error(
        "The replacement image does not exist for this vehicle.",
      );

      error.code = "CAR_IMAGE_NOT_FOUND";
      error.status = 404;

      throw error;
    }

    const oldPrimaryResult = await client.query(
      `
        SELECT
          id,
          car_id,
          image_url,
          is_primary,
          image_type,
          sort_order,
          cloudinary_public_id,
          cloudinary_format,
          width,
          height,
          bytes
        FROM car_images
        WHERE car_id = $1
          AND id <> $2
          AND (
            is_primary = TRUE
            OR image_type = 'primary'
          )
        ORDER BY
          sort_order ASC NULLS LAST,
          id ASC
        FOR UPDATE;
      `,
      [carId, newImageId],
    );

    removedOldPrimaries = oldPrimaryResult.rows;

    if (removedOldPrimaries.length > 0) {
      const oldPrimaryIds = removedOldPrimaries.map((image) => image.id);

      await client.query(
        `
          DELETE FROM car_images
          WHERE id = ANY($1::int[])
            AND car_id = $2;
        `,
        [oldPrimaryIds, carId],
      );
    }

    const promoteResult = await client.query(
      `
        UPDATE car_images
        SET
          is_primary = TRUE,
          image_type = 'primary'
        WHERE id = $1
          AND car_id = $2
        RETURNING
          id,
          car_id,
          image_url,
          is_primary,
          image_type,
          sort_order,
          cloudinary_public_id,
          cloudinary_format,
          width,
          height,
          bytes;
      `,
      [newImageId, carId],
    );

    if (promoteResult.rows.length === 0) {
      const error = new Error("Unable to promote the replacement image.");

      error.code = "PRIMARY_IMAGE_PROMOTION_FAILED";
      error.status = 500;

      throw error;
    }

    newPrimary = promoteResult.rows[0];

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Primary image replacement rollback failed:",
        rollbackError.message,
      );
    }

    throw error;
  } finally {
    client.release();
  }

  /*
   * Database replacement is already committed here.
   *
   * Cloudinary cleanup is best effort.
   *
   * A cleanup problem must never undo the valid new primary.
   */
  const cloudinaryCleanup = [];

  for (const oldImage of removedOldPrimaries) {
    const cleanupResult = await cleanupCloudinaryAsset(
      oldImage.cloudinary_public_id,
    );

    cloudinaryCleanup.push({
      imageId: oldImage.id,
      imageUrl: oldImage.image_url,
      publicId: oldImage.cloudinary_public_id,
      ...cleanupResult,
    });
  }

  return {
    newPrimary,
    removedOldPrimaries,
    cloudinaryCleanup,
  };
}

/*
|--------------------------------------------------------------------------
| SINGLE IMAGE UPLOAD
|--------------------------------------------------------------------------
*/

export const uploadCarImageService = async ({
  fileBuffer,
  carId,
  imageType = "general",
}) => {
  const parsedCarId = parseCarId(carId);

  await ensureCarExists(parsedCarId);

  const normalizedImageType = normalizeImageType(imageType);

  const processed = await optimizeImageBuffer(fileBuffer);

  const uploadResult = await uploadBufferToCloudinary(
    processed.optimizedBuffer,
    {
      folder: "car-images",
      publicId: `car-${parsedCarId}-${Date.now()}`,
    },
  );

  let savedImage = null;

  try {
    const sortOrder = await getNextSortOrder(parsedCarId);

    savedImage = await saveCarImageRecord({
      carId: parsedCarId,

      imageUrl: uploadResult.secure_url,

      imageType: normalizedImageType,

      sortOrder,

      cloudinaryPublicId: uploadResult.public_id,

      cloudinaryFormat: uploadResult.format,

      width: uploadResult.width,

      height: uploadResult.height,

      bytes: uploadResult.bytes,
    });

    let primaryReplacement = null;

    if (normalizedImageType === "primary") {
      primaryReplacement = await replacePrimaryImage({
        carId: parsedCarId,
        newImageId: savedImage.id,
      });

      savedImage = primaryReplacement.newPrimary;
    }

    return {
      database: savedImage,

      primaryReplacement: primaryReplacement
        ? {
            changed: true,

            newPrimaryImageId: primaryReplacement.newPrimary.id,

            removedOldPrimaryIds: primaryReplacement.removedOldPrimaries.map(
              (image) => image.id,
            ),

            cloudinaryCleanup: primaryReplacement.cloudinaryCleanup,
          }
        : null,

      cloudinary: {
        publicId: uploadResult.public_id,

        secureUrl: uploadResult.secure_url,

        resourceType: uploadResult.resource_type,

        format: uploadResult.format,

        width: uploadResult.width,

        height: uploadResult.height,

        bytes: uploadResult.bytes,

        createdAt: uploadResult.created_at,
      },

      optimization: {
        original: {
          format: processed.originalMetadata.format || "unknown",

          width: processed.originalMetadata.width || null,

          height: processed.originalMetadata.height || null,

          bytes: processed.originalBytes,
        },

        optimized: {
          format: processed.optimizedMetadata.format || "webp",

          width: processed.optimizedMetadata.width || null,

          height: processed.optimizedMetadata.height || null,

          bytes: processed.optimizedBytes,
        },

        maxWidth: processed.optimization.maxWidth,

        maxHeight: processed.optimization.maxHeight,

        requestedFormat: "webp",

        reductionPercentage: processed.reductionPercentage,
      },
    };
  } catch (error) {
    if (savedImage?.id) {
      await removeTemporaryImage({
        imageId: savedImage.id,
        carId: parsedCarId,
      });
    }

    await cleanupCloudinaryAsset(uploadResult.public_id);

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| PROCESS ONE FILE FROM BATCH
|--------------------------------------------------------------------------
*/

async function processBatchFile({
  file,
  carId,
  batchIndex,
  sortOrder,
  primaryIndex,
  defaultImageType,
}) {
  let uploadResult = null;
  let databaseRecord = null;

  try {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new Error("Uploaded file buffer is missing.");
    }

    const requestedImageType =
      batchIndex === primaryIndex
        ? "primary"
        : normalizeImageType(defaultImageType);

    const processed = await optimizeImageBuffer(file.buffer);

    uploadResult = await uploadBufferToCloudinary(processed.optimizedBuffer, {
      folder: "car-images",

      publicId: `car-${carId}-batch-${Date.now()}-${batchIndex}`,
    });

    databaseRecord = await saveCarImageRecord({
      carId,

      imageUrl: uploadResult.secure_url,

      imageType: requestedImageType,

      sortOrder,

      cloudinaryPublicId: uploadResult.public_id,

      cloudinaryFormat: uploadResult.format,

      width: uploadResult.width,

      height: uploadResult.height,

      bytes: uploadResult.bytes,
    });

    return {
      success: true,

      batchIndex,

      originalName: file.originalname,

      mimeType: file.mimetype,

      sortOrder,

      requestedImageType,

      imageType: databaseRecord.image_type,

      database: databaseRecord,

      cloudinary: {
        publicId: uploadResult.public_id,

        secureUrl: uploadResult.secure_url,

        format: uploadResult.format,

        width: uploadResult.width,

        height: uploadResult.height,

        bytes: uploadResult.bytes,
      },

      optimization: {
        originalFormat: processed.originalMetadata.format,

        optimizedFormat: processed.optimizedMetadata.format,

        originalBytes: processed.originalBytes,

        optimizedBytes: processed.optimizedBytes,

        reductionPercentage: processed.reductionPercentage,
      },
    };
  } catch (error) {
    if (uploadResult?.public_id && !databaseRecord) {
      await cleanupCloudinaryAsset(uploadResult.public_id);
    }

    return {
      success: false,

      batchIndex,

      originalName: file?.originalname || null,

      mimeType: file?.mimetype || null,

      sortOrder,

      error: {
        code: error.code || "IMAGE_PROCESSING_FAILED",

        message: error.message || "Image processing failed.",
      },
    };
  }
}

/*
|--------------------------------------------------------------------------
| CONCURRENCY-LIMITED QUEUE
|--------------------------------------------------------------------------
*/

async function runBatchQueue({
  files,
  carId,
  startingSortOrder,
  primaryIndex,
  defaultImageType,
}) {
  const results = new Array(files.length);

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;

      nextIndex += 1;

      if (currentIndex >= files.length) {
        return;
      }

      results[currentIndex] = await processBatchFile({
        file: files[currentIndex],

        carId,

        batchIndex: currentIndex,

        sortOrder: startingSortOrder + currentIndex,

        primaryIndex,

        defaultImageType,
      });
    }
  }

  const workerCount = Math.min(Math.max(1, BATCH_CONCURRENCY), files.length);

  const workers = Array.from(
    {
      length: workerCount,
    },
    () => worker(),
  );

  await Promise.all(workers);

  return results;
}

/*
|--------------------------------------------------------------------------
| BATCH IMAGE UPLOAD
|--------------------------------------------------------------------------
*/

export const uploadCarImageBatchService = async ({
  files,
  carId,
  primaryIndex = 0,
  imageType = "general",
}) => {
  const parsedCarId = parseCarId(carId);

  await ensureCarExists(parsedCarId);

  if (!Array.isArray(files) || files.length === 0) {
    const error = new Error("At least one image is required.");

    error.code = "MISSING_IMAGE_FILES";
    error.status = 400;

    throw error;
  }

  if (files.length > 10) {
    const error = new Error("A maximum of 10 images may be uploaded at once.");

    error.code = "TOO_MANY_IMAGES";
    error.status = 400;

    throw error;
  }

  let parsedPrimaryIndex = Number(primaryIndex);

  if (
    !Number.isInteger(parsedPrimaryIndex) ||
    parsedPrimaryIndex < 0 ||
    parsedPrimaryIndex >= files.length
  ) {
    parsedPrimaryIndex = 0;
  }

  const startingSortOrder = await getNextSortOrder(parsedCarId);

  const startedAt = Date.now();

  const results = await runBatchQueue({
    files,

    carId: parsedCarId,

    startingSortOrder,

    primaryIndex: parsedPrimaryIndex,

    defaultImageType: imageType,
  });

  const primaryCandidate = results[parsedPrimaryIndex];

  let primaryReplacement = {
    requestedIndex: parsedPrimaryIndex,

    changed: false,

    newPrimaryImageId: null,

    removedOldPrimaryIds: [],

    preservedExistingPrimary: true,

    cloudinaryCleanup: [],
  };

  if (primaryCandidate?.success && primaryCandidate?.database?.id) {
    try {
      const replacement = await replacePrimaryImage({
        carId: parsedCarId,

        newImageId: primaryCandidate.database.id,
      });

      primaryCandidate.imageType = "primary";

      primaryCandidate.database = replacement.newPrimary;

      primaryReplacement = {
        requestedIndex: parsedPrimaryIndex,

        changed: true,

        newPrimaryImageId: replacement.newPrimary.id,

        removedOldPrimaryIds: replacement.removedOldPrimaries.map(
          (image) => image.id,
        ),

        preservedExistingPrimary: false,

        cloudinaryCleanup: replacement.cloudinaryCleanup,
      };
    } catch (error) {
      await removeTemporaryImage({
        imageId: primaryCandidate.database.id,

        carId: parsedCarId,
      });

      const candidateCloudinaryCleanup = await cleanupCloudinaryAsset(
        primaryCandidate.cloudinary?.publicId,
      );

      primaryCandidate.success = false;

      primaryCandidate.imageType = null;

      primaryCandidate.error = {
        code: error.code || "PRIMARY_REPLACEMENT_FAILED",

        message:
          error.message || "Unable to replace the primary vehicle image.",
      };

      primaryCandidate.cleanup = {
        databaseCandidateRemoved: true,

        cloudinary: candidateCloudinaryCleanup,
      };
    }
  }

  const successful = results.filter((result) => result.success);

  const failed = results.filter((result) => !result.success);

  return {
    carId: parsedCarId,

    requestedCount: files.length,

    successfulCount: successful.length,

    failedCount: failed.length,

    partialFailure: failed.length > 0 && successful.length > 0,

    allSucceeded: failed.length === 0,

    concurrency: Math.min(Math.max(1, BATCH_CONCURRENCY), files.length),

    processingTimeMs: Date.now() - startedAt,

    startingSortOrder,

    primaryReplacement,

    results,
  };
};
