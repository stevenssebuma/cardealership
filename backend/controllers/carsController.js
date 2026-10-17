import {
  createCar,
  deleteCar,
  getAllCars,
  getCarById,
  updateCar,
} from "../models/carsModel.js";
function failure(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}
function validCar(body, partial = false) {
  const year = body.year === undefined ? undefined : Number(body.year);
  const price = body.price === undefined ? undefined : Number(body.price);
  if (!partial && (!body.name || !(body.brand || body.make)))
    return "Vehicle name and brand are required.";
  if (year !== undefined && (!Number.isInteger(year) || year < 1900))
    return "A valid vehicle year is required.";
  if (price !== undefined && (!Number.isFinite(price) || price <= 0))
    return "A valid vehicle price is required.";
  return null;
}
export async function fetchCars(req, res) {
  try {
    const cars = await getAllCars(req.query);
    return res.json({ success: true, count: cars.length, cars });
  } catch {
    return failure(res, 500, "Unable to load vehicle inventory.");
  }
}
export async function fetchCarById(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return failure(res, 400, "A valid car ID is required.");
  try {
    const result = await getCarById(id);
    if (!result.car)
      return failure(res, 404, "The requested vehicle was not found.");
    return res.json({
      success: true,
      car: { ...result.car, images: result.images },
    });
  } catch {
    return failure(res, 500, "Unable to load the selected vehicle.");
  }
}
export async function addCar(req, res) {
  const issue = validCar(req.body);
  if (issue) return failure(res, 400, issue);
  try {
    const id = await createCar({
      ...req.body,
      year: Number(req.body.year),
      price: Number(req.body.price),
    });
    return res.status(201).json({
      success: true,
      message: "Vehicle created successfully.",
      car: { id },
    });
  } catch (error) {
    return failure(
      res,
      error.code === "23505" ? 409 : 500,
      error.code === "23505"
        ? "Vehicle identifier already exists."
        : "Unable to create the vehicle.",
    );
  }
}
export async function editCar(req, res) {
  const id = Number(req.params.id);
  const issue = validCar(req.body, true);
  if (!Number.isInteger(id) || id <= 0 || issue)
    return failure(res, 400, issue || "A valid car ID is required.");
  const car = await updateCar(id, {
    ...req.body,
    year: req.body.year === undefined ? undefined : Number(req.body.year),
    price: req.body.price === undefined ? undefined : Number(req.body.price),
  });
  if (!car) return failure(res, 404, "The requested vehicle was not found.");
  return res.json({ success: true, car });
}
export async function removeCar(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return failure(res, 400, "A valid car ID is required.");
  try {
    const deleted = await deleteCar(id);
    if (!deleted)
      return failure(res, 404, "The requested vehicle was not found.");
    return res.json({
      success: true,
      message: "Vehicle deleted successfully.",
    });
  } catch (error) {
    return failure(
      res,
      error.code === "23503" ? 409 : 500,
      error.code === "23503"
        ? "A vehicle with existing records cannot be deleted."
        : "Unable to delete the vehicle.",
    );
  }
}
