// backend/server.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import winston from "winston";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import bookingRoutes from "./routes/bookingRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import optimizedRoutes from "./routes/optimizedRoutes.js";
import adminMetricsRoutes from "./routes/adminMetricsRoutes.js";

import { performanceMiddleware } from "./middleware/performanceMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/*
|--------------------------------------------------------------------------
| WINSTON ERROR LOGGING
|--------------------------------------------------------------------------
|
| Every server error can now be written to:
|
| backend/logs/error.log
| backend/logs/combined.log
|
*/

const logsDirectory = path.join(__dirname, "logs");

if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory, {
    recursive: true,
  });
}

const logger = winston.createLogger({
  level: "info",

  format: winston.format.combine(
    winston.format.timestamp(),

    winston.format.errors({
      stack: true,
    }),

    winston.format.json(),
  ),

  transports: [
    /*
    |--------------------------------------------------------------------------
    | ERROR LOG
    |--------------------------------------------------------------------------
    |
    | Stores errors only.
    |
    */

    new winston.transports.File({
      filename: path.join(logsDirectory, "error.log"),

      level: "error",
    }),

    /*
    |--------------------------------------------------------------------------
    | COMBINED LOG
    |--------------------------------------------------------------------------
    |
    | Stores general application logging.
    |
    */

    new winston.transports.File({
      filename: path.join(logsDirectory, "combined.log"),
    }),
  ],
});

/*
|--------------------------------------------------------------------------
| DEVELOPMENT CONSOLE LOGGING
|--------------------------------------------------------------------------
*/

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),

        winston.format.timestamp(),

        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} ${level}: ${stack || message}`;
        }),
      ),
    }),
  );
}

/*
|--------------------------------------------------------------------------
| BASIC MIDDLEWARE
|--------------------------------------------------------------------------
*/

app.use(cors());

app.use(express.json());

app.use(performanceMiddleware);

/*
|--------------------------------------------------------------------------
| REQUEST LOGGING
|--------------------------------------------------------------------------
|
| Useful context when debugging production failures.
|
*/

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startedAt;

    if (res.statusCode >= 500) {
      logger.error("HTTP request returned server error", {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
    }
  });

  next();
});

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

app.use("/api/bookings", bookingRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/optimized", optimizedRoutes);

app.use("/api/admin/metrics", adminMetricsRoutes);

/*
|--------------------------------------------------------------------------
| FINANCIAL PAYMENT APPROXIMATION
|--------------------------------------------------------------------------
*/

app.post("/api/finance/calculate", (req, res, next) => {
  try {
    const { carPrice, downPayment, interestRate, loanTermMonths } = req.body;

    if (
      carPrice === undefined ||
      downPayment === undefined ||
      interestRate === undefined ||
      loanTermMonths === undefined
    ) {
      return res.status(400).json({
        error: "Missing required fields",

        required: ["carPrice", "downPayment", "interestRate", "loanTermMonths"],
      });
    }

    const price = parseFloat(carPrice);

    const down = parseFloat(downPayment);

    const rate = parseFloat(interestRate);

    const term = parseInt(loanTermMonths, 10);

    if (price < 0) {
      return res.status(400).json({
        error: "Car price cannot be negative",
      });
    }

    if (down < 0) {
      return res.status(400).json({
        error: "Down payment cannot be negative",
      });
    }

    if (rate < 0) {
      return res.status(400).json({
        error: "Interest rate cannot be negative",
      });
    }

    if (term <= 0) {
      return res.status(400).json({
        error: "Loan term must be greater than 0 months",
      });
    }

    const loanAmount = price - down;

    if (loanAmount <= 0) {
      return res.status(400).json({
        error: "Down payment must be less than car price",

        message: "Your down payment already covers the full price!",
      });
    }

    const monthlyRate = rate / 100 / 12;

    let monthlyPayment;
    let totalPayment;
    let totalInterest;

    if (monthlyRate === 0) {
      monthlyPayment = loanAmount / term;

      totalPayment = loanAmount;

      totalInterest = 0;
    } else {
      const compoundFactor = Math.pow(1 + monthlyRate, term);

      monthlyPayment =
        (loanAmount * (monthlyRate * compoundFactor)) / (compoundFactor - 1);

      totalPayment = monthlyPayment * term;

      totalInterest = totalPayment - loanAmount;
    }

    const paymentSchedule = [];

    let remainingBalance = loanAmount;

    for (let month = 1; month <= Math.min(6, term); month += 1) {
      const interestPayment = remainingBalance * monthlyRate;

      const principalPayment = monthlyPayment - interestPayment;

      remainingBalance -= principalPayment;

      paymentSchedule.push({
        month,

        payment: Math.round(monthlyPayment),

        principal: Math.round(principalPayment),

        interest: Math.round(interestPayment),

        remainingBalance: Math.max(0, Math.round(remainingBalance)),
      });
    }

    return res.json({
      success: true,

      inputs: {
        carPrice: price,
        downPayment: down,
        loanAmount,
        interestRate: rate,
        loanTermMonths: term,
      },

      results: {
        monthlyPayment: Math.round(monthlyPayment),

        totalPayment: Math.round(totalPayment),

        totalInterest: Math.round(totalInterest),

        paymentSchedule,

        currency: "UGX",
      },
    });
  } catch (error) {
    /*
      Pass the error to the global
      Winston error handler.
      */

    next(error);
  }
});

/*
|--------------------------------------------------------------------------
| DEALERSHIP LOCATION
|--------------------------------------------------------------------------
*/

app.get("/api/dealership/location", (req, res, next) => {
  try {
    const dealershipInfo = {
      success: true,

      dealership: {
        name: "Panda Motors Ltd",

        description: "Uganda's trusted luxury vehicle importer",

        address: {
          street: "Banda, Jinja Road",

          city: "Kampala",

          district: "Kampala District",

          country: "Uganda",

          fullAddress: "Banda, Jinja Road, Kampala, Uganda",
        },

        location: {
          latitude: 0.3488,

          longitude: 32.616,

          zoom: 15,
        },

        operatingHours: {
          monday: {
            open: "08:00",
            close: "18:00",
            isOpen: true,
          },

          tuesday: {
            open: "08:00",
            close: "18:00",
            isOpen: true,
          },

          wednesday: {
            open: "08:00",
            close: "18:00",
            isOpen: true,
          },

          thursday: {
            open: "08:00",
            close: "18:00",
            isOpen: true,
          },

          friday: {
            open: "08:00",
            close: "18:00",
            isOpen: true,
          },

          saturday: {
            open: "09:00",
            close: "17:00",
            isOpen: true,
          },

          sunday: {
            open: "00:00",
            close: "00:00",
            isOpen: false,
            note: "Closed",
          },
        },

        contact: {
          phone: ["+256 770 826 951", "+256 756 053 475"],

          whatsapp: "+256 770 826 951",

          email: "sales@pandamotors.co.ug",
        },

        services: [
          "URA Duty Clearance",
          "Import Documentation",
          "Certified Workshop",
          "Flexible Financing",
        ],

        googleMapsUrl:
          "https://maps.google.com/?q=Banda,+Jinja+Road,+Kampala,+Uganda",

        directionsUrl:
          "https://maps.google.com/dir//Banda,+Jinja+Road,+Kampala,+Uganda",

        embedMapUrl:
          "https://maps.google.com/maps?q=Banda+Kampala+Uganda&z=15&output=embed",
      },
    };

    return res.json(dealershipInfo);
  } catch (error) {
    next(error);
  }
});

/*
|--------------------------------------------------------------------------
| DEALERSHIP OPEN STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/dealership/status", (req, res, next) => {
  try {
    const now = new Date();

    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];

    const currentDay = dayNames[now.getDay()];

    const currentTime = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });

    const hours = {
      monday: {
        open: "08:00",
        close: "18:00",
      },

      tuesday: {
        open: "08:00",
        close: "18:00",
      },

      wednesday: {
        open: "08:00",
        close: "18:00",
      },

      thursday: {
        open: "08:00",
        close: "18:00",
      },

      friday: {
        open: "08:00",
        close: "18:00",
      },

      saturday: {
        open: "09:00",
        close: "17:00",
      },

      sunday: {
        open: "00:00",
        close: "00:00",
      },
    };

    const todayHours = hours[currentDay];

    const isOpen =
      currentDay !== "sunday" &&
      currentTime >= todayHours.open &&
      currentTime <= todayHours.close;

    return res.json({
      success: true,
      currentTime,
      currentDay,
      isOpen,
      operatingHours: todayHours,

      message: isOpen
        ? "We are currently open! Visit us today."
        : "We are closed. Please visit during business hours.",
    });
  } catch (error) {
    next(error);
  }
});

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {
  return res.json({
    status: "OK",

    timestamp: new Date().toISOString(),

    message: "Panda Motors API is running!",

    version: "2.0.0",
  });
});

/*
|--------------------------------------------------------------------------
| WINSTON ERROR TEST ROUTE
|--------------------------------------------------------------------------
|
| Development-only endpoint used to prove that a 500 error gets logged.
|
| GET /api/test-error
|
*/

if (process.env.NODE_ENV !== "production") {
  app.get("/api/test-error", (req, res, next) => {
    try {
      throw new Error("Winston test error - intentional 500 error");
    } catch (error) {
      next(error);
    }
  });
}

/*
|--------------------------------------------------------------------------
| 404 HANDLER
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  return res.status(404).json({
    success: false,

    message: "Endpoint not found",
  });
});

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
|
| THIS IS THE IMPORTANT PART OF TASK 2.
|
| Every unexpected error reaching this middleware:
|
| 1. receives HTTP 500;
| 2. is logged by Winston;
| 3. includes timestamp;
| 4. includes stack/error details;
| 5. includes HTTP request information.
|
*/

app.use((error, req, res, next) => {
  const statusCode = error.status || error.statusCode || 500;

  if (statusCode >= 500) {
    logger.error(error.message || "Internal Server Error", {
      timestamp: new Date().toISOString(),

      statusCode,

      method: req.method,

      url: req.originalUrl,

      ip: req.ip,

      userAgent: req.get("user-agent"),

      stack: error.stack,

      errorName: error.name,

      errorCode: error.code || null,
    });
  }

  if (res.headersSent) {
    return next(error);
  }

  return res.status(statusCode).json({
    success: false,

    message: statusCode >= 500 ? "Internal server error" : error.message,

    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

/*
|--------------------------------------------------------------------------
| UNHANDLED PROMISE REJECTIONS
|--------------------------------------------------------------------------
*/

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection", {
    reason: reason instanceof Error ? reason.message : reason,

    stack: reason instanceof Error ? reason.stack : null,
  });
});

/*
|--------------------------------------------------------------------------
| UNCAUGHT EXCEPTIONS
|--------------------------------------------------------------------------
*/

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    message: error.message,

    stack: error.stack,
  });
});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
  logger.info(`Panda Motors API server started on port ${PORT}`);

  console.log("\n========================================");

  console.log("🚀 Panda Motors API Server");

  console.log("========================================");

  console.log(`🚀 Server running on: http://localhost:${PORT}`);

  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);

  console.log("📝 Winston error logging enabled");

  console.log(`📝 Error log: ${path.join(logsDirectory, "error.log")}`);

  console.log("========================================\n");
});
