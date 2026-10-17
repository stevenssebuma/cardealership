import express from "express";
import { bulkCarImageController } from "../controllers/bulkCarImageController.js";
import { bulkImageUpload } from "../middleware/bulkImageUpload.js";
import { uploadCarImage } from "../controllers/carImageController.js";
import {
  addCar,
  editCar,
  fetchCarById,
  fetchCars,
  removeCar,
} from "../controllers/carsController.js";
import { authenticateToken, isAdmin } from "../middleware/authMiddleware.js";
import { uploadSingleCarImage } from "../middleware/uploadMiddleware.js";

const router = express.Router();
router.get("/", fetchCars);
router.post(
  "/upload",
  authenticateToken,
  isAdmin,
  uploadSingleCarImage,
  uploadCarImage,
);
router.post("/", authenticateToken, isAdmin, addCar);
router.post(
  "/:id/images/bulk",
  authenticateToken,
  isAdmin,
  bulkImageUpload,
  bulkCarImageController.uploadBulkImages,
);
router.get("/:id", fetchCarById);
router.put("/:id", authenticateToken, isAdmin, editCar);
router.delete("/:id", authenticateToken, isAdmin, removeCar);
export default router;
