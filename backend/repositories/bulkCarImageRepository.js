import {
  getCarById,
  saveCarImage,
} from "../models/carsModel.js";

export const createCarLookupRepository = (database) => Object.freeze({
  async findById(carId) {
    const normalizedCarId = Number(carId);

    if (
      !Number.isInteger(normalizedCarId) ||
      normalizedCarId <= 0
    ) {
      return null;
    }

    const result = await getCarById(normalizedCarId, database);
    return result?.car || null;
  },
});

export const createCarImageRepository = (database) => Object.freeze({
  async create({
    carId,
    url,
    displayOrder = 0,
  }) {
    const normalizedCarId = Number(carId);
    if (!Number.isSafeInteger(normalizedCarId) || normalizedCarId <= 0 || typeof url !== 'string' || !url.trim()) {
      throw new TypeError('A valid car ID and image URL are required.');
    }
    const imageType =
      Number(displayOrder) === 0
        ? "primary"
        : "general";

    const image = await saveCarImage(
      normalizedCarId,
      url,
      imageType,
      database,
    );

    return Object.freeze({
      id: image.id,
      carId: image.car_id,
      url: image.image_url,
      imageType: image.image_type,
    });
  },
});

export const carLookupRepository = createCarLookupRepository();
export const carImageRepository = createCarImageRepository();
