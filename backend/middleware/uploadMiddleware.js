import multer from "multer";

const storage = multer.memoryStorage();

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_BATCH_FILES = 10;

const INVALID_IMAGE_TYPE_MESSAGE = "Only image files are allowed.";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function buildUploadError({ status, code, message, details }) {
  return {
    success: false,
    error: {
      code,
      message,
      status,
      details: details || null,
    },
  };
}

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_BATCH_FILES,
  },

  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      const typeError = new Error(INVALID_IMAGE_TYPE_MESSAGE);

      typeError.code = "INVALID_IMAGE_TYPE";

      typeError.receivedMimeType = file.mimetype;

      typeError.originalName = file.originalname;

      return cb(typeError, false);
    }

    return cb(null, true);
  },
});

function handleUploadError(error, req, res, next) {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json(
      buildUploadError({
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
        message: "Uploaded image exceeds the 15MB per-file limit.",
        details: {
          maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
          maxFileSizeMb: 15,
        },
      }),
    );
  }

  if (
    error instanceof multer.MulterError &&
    error.code === "LIMIT_FILE_COUNT"
  ) {
    return res.status(400).json(
      buildUploadError({
        status: 400,
        code: "TOO_MANY_IMAGES",
        message: `A maximum of ${MAX_BATCH_FILES} images may be uploaded at once.`,
        details: {
          maxFiles: MAX_BATCH_FILES,
        },
      }),
    );
  }

  if (
    error instanceof multer.MulterError &&
    error.code === "LIMIT_UNEXPECTED_FILE"
  ) {
    return res.status(400).json(
      buildUploadError({
        status: 400,
        code: "UNEXPECTED_FILE",
        message: `Only the expected image field is allowed, with a maximum of ${MAX_BATCH_FILES} files.`,
        details: {
          field: error.field || null,
          maxFiles: MAX_BATCH_FILES,
        },
      }),
    );
  }

  if (error.code === "INVALID_IMAGE_TYPE") {
    return res.status(415).json(
      buildUploadError({
        status: 415,
        code: "UNSUPPORTED_MEDIA_TYPE",
        message:
          "Only jpeg, png, webp, heic and heif image uploads are supported.",
        details: {
          receivedMimeType: error.receivedMimeType || null,
          originalName: error.originalName || null,
          allowedMimeTypes: ALLOWED_IMAGE_TYPES,
        },
      }),
    );
  }

  return res.status(400).json(
    buildUploadError({
      status: 400,
      code: "UPLOAD_VALIDATION_FAILED",
      message: error.message || "Image upload validation failed.",
    }),
  );
}

export const uploadSingleCarImage = (req, res, next) => {
  upload.single("image")(req, res, (error) =>
    handleUploadError(error, req, res, next),
  );
};

export const uploadCarImageBatch = (req, res, next) => {
  upload.array("images", MAX_BATCH_FILES)(req, res, (error) =>
    handleUploadError(error, req, res, next),
  );
};

export { MAX_BATCH_FILES, MAX_FILE_SIZE_BYTES, ALLOWED_IMAGE_TYPES };

export default upload;
