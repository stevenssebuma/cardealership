import {
  uploadCarImageService,
  uploadCarImageBatchService,
} from "../services/carImageService.js";

function sendError(res, status, code, message, details = null) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      status,
      details,
    },
  });
}

export const uploadCarImage = async (req, res) => {
  try {
    const { carId, imageType } = req.body;

    if (!req.file) {
      return sendError(
        res,
        400,
        "MISSING_IMAGE_FILE",
        "No image file was uploaded.",
      );
    }

    if (!carId) {
      return sendError(res, 400, "CAR_ID_REQUIRED", "carId is required.");
    }

    const result = await uploadCarImageService({
      fileBuffer: req.file.buffer,

      carId,

      imageType,
    });

    return res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      image: result,
    });
  } catch (error) {
    return sendError(
      res,
      error.status || 500,
      error.code || "IMAGE_UPLOAD_FAILED",
      error.status ? error.message : "Image upload failed.",
      {
        reason: error.message,
      },
    );
  }
};

export const uploadCarImageBatch = async (req, res) => {
  try {
    const carId = Number(req.params.id);

    if (!Number.isInteger(carId) || carId <= 0) {
      return sendError(
        res,
        400,
        "INVALID_CAR_ID",
        "A valid car ID is required.",
      );
    }

    if (!Array.isArray(req.files) || req.files.length === 0) {
      return sendError(
        res,
        400,
        "MISSING_IMAGE_FILES",
        "At least one image must be uploaded.",
      );
    }

    const { primaryIndex = 0, imageType = "general" } = req.body;

    const result = await uploadCarImageBatchService({
      files: req.files,

      carId,

      primaryIndex,

      imageType,
    });

    let statusCode = 201;

    if (result.partialFailure) {
      statusCode = 207;
    } else if (result.successfulCount === 0) {
      statusCode = 422;
    }

    return res.status(statusCode).json({
      success: result.successfulCount > 0,

      message: result.allSucceeded
        ? "All car images uploaded successfully."
        : result.partialFailure
          ? "Batch completed with some image failures."
          : "No images in the batch could be processed.",

      batch: result,
    });
  } catch (error) {
    return sendError(
      res,
      error.status || 500,
      error.code || "BATCH_IMAGE_UPLOAD_FAILED",
      error.status ? error.message : "Batch image upload failed.",
      {
        reason: error.message,
      },
    );
  }
};
