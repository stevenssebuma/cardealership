import {
  getAllCars,
  getCarById,
  createCar,
  recordCarView,
  updateCarPrice,
  getCarPriceHistory,
} from "../models/carsModel.js";

/*
|--------------------------------------------------------------------------
| STANDARD ERROR RESPONSE
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| NUMBER HELPER
|--------------------------------------------------------------------------
*/

function numberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/*
|--------------------------------------------------------------------------
| DYNAMIC VEHICLE PRICING MATRIX ENGINE
|--------------------------------------------------------------------------
|
| Maximum score = 100
|
| 30 points:
| inventory age
|
| 20 points:
| recent customer interest
|
| 30 points:
| current price compared with similar inventory
|
| 20 points:
| historical price reduction
|
| This is an internal dealership pricing heuristic.
|
| It is NOT claiming to be an external-market valuation.
|
*/

function calculateDealMatrix(car) {
  const currentPrice = Number(car.price || 0);

  const daysListed = Math.max(0, Number(car.days_listed || 0));

  const totalViews = Math.max(0, Number(car.total_views || 0));

  const recentViews = Math.max(0, Number(car.views_last_30_days || 0));

  const previousPrice = numberOrNull(car.previous_price);

  const peerMedianPrice = numberOrNull(car.peer_median_price);

  /*
  |--------------------------------------------------------------------------
  | 1. Inventory-age score
  |--------------------------------------------------------------------------
  |
  | 90+ days gives the maximum 30 age points.
  |
  */

  const ageScore = Math.min(30, Math.round((daysListed / 90) * 30));

  /*
  |--------------------------------------------------------------------------
  | 2. Customer-interest score
  |--------------------------------------------------------------------------
  |
  | 100+ views in the last 30 days gives the full 20 points.
  |
  | High views + no sale can indicate that pricing is holding conversion back.
  |
  */

  const viewScore = Math.min(20, Math.round((recentViews / 100) * 20));

  /*
  |--------------------------------------------------------------------------
  | 3. Peer-price score
  |--------------------------------------------------------------------------
  |
  | Compares the car with similar available inventory:
  |
  | same brand
  | year ± 1
  |
  */

  let priceScore = 10;
  let peerPriceDifferencePercentage = null;

  if (peerMedianPrice && peerMedianPrice > 0 && currentPrice > 0) {
    peerPriceDifferencePercentage = Number(
      (((currentPrice - peerMedianPrice) / peerMedianPrice) * 100).toFixed(2),
    );

    const ratio = currentPrice / peerMedianPrice;

    if (ratio <= 0.9) {
      priceScore = 30;
    } else if (ratio <= 1) {
      priceScore = 24;
    } else if (ratio <= 1.1) {
      priceScore = 14;
    } else {
      priceScore = 5;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | 4. Historical price-drop score
  |--------------------------------------------------------------------------
  */

  let priceDropPercentage = 0;

  if (previousPrice && previousPrice > 0 && currentPrice < previousPrice) {
    priceDropPercentage = Number(
      (((previousPrice - currentPrice) / previousPrice) * 100).toFixed(2),
    );
  }

  const dropScore = Math.min(20, Math.round(priceDropPercentage * 2));

  /*
  |--------------------------------------------------------------------------
  | Final Deal Score
  |--------------------------------------------------------------------------
  */

  const dealScore = Math.min(
    100,
    ageScore + viewScore + priceScore + dropScore,
  );

  /*
  |--------------------------------------------------------------------------
  | Recommended price reduction
  |--------------------------------------------------------------------------
  |
  | Recommendation only.
  |
  | This DOES NOT automatically mutate cars.price.
  |
  */

  let recommendedDiscountPercentage = 0;

  if (daysListed >= 90) {
    recommendedDiscountPercentage += 10;
  } else if (daysListed >= 60) {
    recommendedDiscountPercentage += 7.5;
  } else if (daysListed >= 30) {
    recommendedDiscountPercentage += 5;
  }

  if (recentViews >= 100) {
    recommendedDiscountPercentage += 2.5;
  } else if (recentViews >= 50) {
    recommendedDiscountPercentage += 1.5;
  }

  if (peerMedianPrice && currentPrice > peerMedianPrice * 1.1) {
    recommendedDiscountPercentage += 2.5;
  }

  recommendedDiscountPercentage = Math.min(15, recommendedDiscountPercentage);

  const suggestedPrice =
    recommendedDiscountPercentage > 0 && currentPrice > 0
      ? Math.round(currentPrice * (1 - recommendedDiscountPercentage / 100))
      : currentPrice;

  /*
  |--------------------------------------------------------------------------
  | Deal Badge
  |--------------------------------------------------------------------------
  */

  let badge = "Standard Price";

  if (priceDropPercentage >= 3) {
    badge = "Price Dropped";
  } else if (dealScore >= 70) {
    badge = "Great Price";
  } else if (dealScore >= 45) {
    badge = "Fair Price";
  }

  return {
    badge,

    score: dealScore,

    currentPrice,

    previousPrice,

    peerMedianPrice,

    peerPriceDifferencePercentage,

    priceDropPercentage,

    daysListed,

    totalViews,

    viewsLast30Days: recentViews,

    recommendedDiscountPercentage,

    suggestedPrice,

    scoreBreakdown: {
      inventoryAge: ageScore,

      customerInterest: viewScore,

      peerPricing: priceScore,

      historicalPriceDrop: dropScore,
    },
  };
}

/*
|--------------------------------------------------------------------------
| ATTACH DEAL MATRIX
|--------------------------------------------------------------------------
*/

function attachDealMatrix(car) {
  return {
    ...car,

    deal: calculateDealMatrix(car),
  };
}

/*
|--------------------------------------------------------------------------
| GET ALL CARS
|--------------------------------------------------------------------------
|
| GET /api/cars
|
*/

export async function fetchCars(req, res) {
  try {
    const cars = await getAllCars();

    const carsWithDeals = cars.map(attachDealMatrix);

    return res.status(200).json({
      success: true,

      count: carsWithDeals.length,

      cars: carsWithDeals,
    });
  } catch (error) {
    console.error("Fetch cars failed:", error);

    return sendError(
      res,
      500,
      "FETCH_CARS_FAILED",
      "Unable to load vehicle inventory.",
      {
        reason: error.message,
      },
    );
  }
}

/*
|--------------------------------------------------------------------------
| GET SINGLE CAR
|--------------------------------------------------------------------------
|
| GET /api/cars/:id
|
| Opening a vehicle details page is treated as a vehicle view.
|
*/

export async function fetchCarById(req, res) {
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

    /*
    |--------------------------------------------------------------------------
    | Fetch first
    |--------------------------------------------------------------------------
    */

    const result = await getCarById(carId);

    if (!result.car) {
      return sendError(
        res,
        404,
        "CAR_NOT_FOUND",
        "The requested vehicle was not found.",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Record view
    |--------------------------------------------------------------------------
    |
    | Public visitor:
    | viewer_id = null
    |
    | Authenticated visitor:
    | viewer_id = req.user.id
    |
    */

    try {
      await recordCarView(carId, req.user?.id || null);
    } catch (viewError) {
      /*
      A failed analytics write must not prevent the customer from seeing
      the vehicle.
      */

      console.error("Vehicle view tracking failed:", viewError);
    }

    /*
    |--------------------------------------------------------------------------
    | Refresh pricing metrics
    |--------------------------------------------------------------------------
    |
    | The newly recorded view should be reflected immediately.
    |
    */

    const refreshed = await getCarById(carId);

    const car = refreshed.car || result.car;

    return res.status(200).json({
      success: true,

      car: {
        ...attachDealMatrix(car),

        images: refreshed.images || result.images,
      },
    });
  } catch (error) {
    console.error("Fetch car by ID failed:", error);

    return sendError(
      res,
      500,
      "FETCH_CAR_FAILED",
      "Unable to load the selected vehicle.",
      {
        reason: error.message,
      },
    );
  }
}

/*
|--------------------------------------------------------------------------
| UPDATE CAR PRICE
|--------------------------------------------------------------------------
|
| PATCH /api/cars/:id/price
|
| BODY:
|
| {
|   "price": 250000000
| }
|
| This will be wired into carsRoutes next.
|
*/

export async function changeCarPrice(req, res) {
  try {
    const carId = Number(req.params.id);

    const newPrice = Number(req.body.price);

    if (!Number.isInteger(carId) || carId <= 0) {
      return sendError(
        res,
        400,
        "INVALID_CAR_ID",
        "A valid car ID is required.",
      );
    }

    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      return sendError(
        res,
        400,
        "INVALID_PRICE",
        "A valid vehicle price is required.",
      );
    }

    const updated = await updateCarPrice({
      carId,

      newPrice,

      changedBy: req.user?.id || null,
    });

    if (!updated) {
      return sendError(
        res,
        404,
        "CAR_NOT_FOUND",
        "The requested vehicle was not found.",
      );
    }

    const refreshed = await getCarById(carId);

    return res.status(200).json({
      success: true,

      message: "Vehicle price updated successfully.",

      oldPrice: updated.oldPrice,

      car: attachDealMatrix(refreshed.car),
    });
  } catch (error) {
    console.error("Update car price failed:", error);

    return sendError(
      res,
      500,
      "UPDATE_CAR_PRICE_FAILED",
      "Unable to update vehicle price.",
      {
        reason: error.message,
      },
    );
  }
}

/*
|--------------------------------------------------------------------------
| PRICE HISTORY
|--------------------------------------------------------------------------
|
| GET /api/cars/:id/price-history
|
| Admin-facing diagnostic endpoint.
|
*/

export async function fetchCarPriceHistory(req, res) {
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

    const history = await getCarPriceHistory(carId);

    return res.status(200).json({
      success: true,

      carId,

      count: history.length,

      history,
    });
  } catch (error) {
    console.error("Fetch price history failed:", error);

    return sendError(
      res,
      500,
      "FETCH_PRICE_HISTORY_FAILED",
      "Unable to load vehicle price history.",
      {
        reason: error.message,
      },
    );
  }
}

/*
|--------------------------------------------------------------------------
| CREATE CAR
|--------------------------------------------------------------------------
*/

export async function addCar(req, res) {
  try {
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
      images = [],
    } = req.body;

    const parsedYear = Number(year);

    const parsedPrice = Number(price);

    if (!name || !brand) {
      return sendError(
        res,
        400,
        "CAR_DETAILS_REQUIRED",
        "Vehicle name and brand are required.",
      );
    }

    if (!Number.isInteger(parsedYear) || parsedYear < 1900) {
      return sendError(
        res,
        400,
        "INVALID_YEAR",
        "A valid vehicle year is required.",
      );
    }

    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      return sendError(
        res,
        400,
        "INVALID_PRICE",
        "A valid vehicle price is required.",
      );
    }

    const carId = await createCar({
      name,
      brand,
      type,
      category,
      year: parsedYear,
      price: parsedPrice,
      power,
      engine,
      drive,
      images,
    });

    return res.status(201).json({
      success: true,

      message: "Vehicle created successfully.",

      car: {
        id: carId,
      },
    });
  } catch (error) {
    console.error("Create car failed:", error);

    return sendError(
      res,
      500,
      "CREATE_CAR_FAILED",
      "Unable to create the vehicle.",
      {
        reason: error.message,
      },
    );
  }
}
