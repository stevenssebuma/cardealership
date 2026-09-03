// backend/routes/carsRoutes.js

import express from "express";

import { validateCarPayload } from "../middleware/validateCarPayload.js";

import {
  fetchCars,
  fetchCarById,
  addCar,
  changeCarPrice,
  fetchCarPriceHistory,
} from "../controllers/carsController.js";

import {
  uploadCarImage,
  uploadCarImageBatch,
} from "../controllers/carImageController.js";

import {
  uploadSingleCarImage,
  uploadCarImageBatch as uploadCarImageBatchMiddleware,
} from "../middleware/uploadMiddleware.js";

import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| CAR INVENTORY
|--------------------------------------------------------------------------
*/

router.get("/", fetchCars);

/*
|--------------------------------------------------------------------------
| EXISTING SINGLE IMAGE UPLOAD
|--------------------------------------------------------------------------
|
| POST /api/cars/upload
|
*/

router.post(
  "/upload",

  protect,

  adminOnly,

  uploadSingleCarImage,

  uploadCarImage,
);

/*
|--------------------------------------------------------------------------
| CREATE CAR
|--------------------------------------------------------------------------
*/

router.post(
  "/",

  protect,

  adminOnly,

  validateCarPayload,

  addCar,
);

/*
|--------------------------------------------------------------------------
| TASK 1 — UPDATE VEHICLE PRICE
|--------------------------------------------------------------------------
*/

router.patch(
  "/:id/price",

  protect,

  adminOnly,

  changeCarPrice,
);

/*
|--------------------------------------------------------------------------
| TASK 1 — PRICE HISTORY
|--------------------------------------------------------------------------
*/

router.get(
  "/:id/price-history",

  protect,

  adminOnly,

  fetchCarPriceHistory,
);

/*
|--------------------------------------------------------------------------
| TASK 2 — BULK MULTI-IMAGE BATCH UPLOAD
|--------------------------------------------------------------------------
|
| POST /api/cars/:id/images/batch
|
| ADMIN ONLY
|
| multipart/form-data
|
| images = up to 10 files
|
*/

router.post(
  "/:id/images/batch",

  protect,

  adminOnly,

  uploadCarImageBatchMiddleware,

  uploadCarImageBatch,
);

/*
|--------------------------------------------------------------------------
| GET SINGLE CAR
|--------------------------------------------------------------------------
|
| Dynamic route stays last.
|
*/

router.get(
  "/:id",

  fetchCarById,
);

export default router;
