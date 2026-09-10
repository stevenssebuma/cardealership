// Import required packages
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Import routes (using ES module syntax)
import bookingRoutes from './routes/bookingRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import optimizedRoutes from './routes/optimizedRoutes.js';
import adminMetricsRoutes from './routes/adminMetricsRoutes.js';
import { startTestDriveReminderJob } from "./jobs/testDriveReminderJob.js";
import userRoutes from './routes/userRoutes.js';
import authRoutes from './routes/authRoutes.js';

// Import performance middleware
import { performanceMiddleware } from './middleware/performanceMiddleware.js';

// Import database configuration and indexes
import { createIndexes, verifyIndexes } from './config/indexes.js';

// Create an Express application
const app = express();

// Define the port
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================

// ============================================
// SPRINT 5 - SECURITY HEADERS
// ============================================
// Helmet adds security-related HTTP headers
// to help protect the API from common attacks.
app.use(helmet());

// ============================================
// SPRINT 5 - PRODUCTION CORS
// ============================================
// Only approved frontend origins can access
// the API through browser requests.

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {

            // Allow requests without an Origin header.
            // This is useful for Postman and server-to-server requests.
            if (!origin) {
                return callback(null, true);
            }

            // Allow only approved frontend origins.
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // Reject unauthorized origins.
            return callback(new Error('Not allowed by CORS'));
        },

        // Allow credentials such as cookies if needed.
        credentials: true
    })
);

// ============================================
// JSON MIDDLEWARE
// ============================================

// Automatically parses incoming JSON data
// from POST requests into req.body
app.use(express.json());

// ============================================
// PERFORMANCE MIDDLEWARE
// ============================================

app.use(performanceMiddleware);

// ============================================
// ROUTES
// ============================================

// Booking routes
app.use('/api/bookings', bookingRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Optimized query routes
app.use('/api/optimized', optimizedRoutes);

// Admin metrics routes
app.use('/api/admin/metrics', adminMetricsRoutes);

// User profile routes
app.use('/api/users', userRoutes);

// Authentication routes
app.use('/api/auth', authRoutes);


// ============================================
// USER STORY 1: Financial Payment Approximation
// ============================================

// POST /api/finance/calculate
// This endpoint calculates monthly loan payments

app.post('/api/finance/calculate', (req, res) => {
    try {

        // STEP 1: Extract data from the request body
        const {
            carPrice,
            downPayment,
            interestRate,
            loanTermMonths
        } = req.body;

        // STEP 2: Input Validation
        if (
            carPrice === undefined ||
            downPayment === undefined ||
            interestRate === undefined ||
            loanTermMonths === undefined
        ) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: [
                    'carPrice',
                    'downPayment',
                    'interestRate',
                    'loanTermMonths'
                ]
            });
        }

        // Convert inputs to numbers
        const price = parseFloat(carPrice);
        const down = parseFloat(downPayment);
        const rate = parseFloat(interestRate);
        const term = parseInt(loanTermMonths);

        // STEP 3: Validate non-negative values
        if (price < 0) {
            return res.status(400).json({
                error: 'Car price cannot be negative'
            });
        }

        if (down < 0) {
            return res.status(400).json({
                error: 'Down payment cannot be negative'
            });
        }

        if (rate < 0) {
            return res.status(400).json({
                error: 'Interest rate cannot be negative'
            });
        }

        if (term <= 0) {
            return res.status(400).json({
                error: 'Loan term must be greater than 0 months'
            });
        }

        // STEP 4: Calculate loan amount
        const loanAmount = price - down;

        // Check if down payment is larger than car price
        if (loanAmount <= 0) {
            return res.status(400).json({
                error: 'Down payment must be less than car price',
                message: 'Your down payment already covers the full price!'
            });
        }

        // STEP 5: Calculate monthly payment
        const monthlyRate = (rate / 100) / 12;

        let monthlyPayment;
        let totalPayment;
        let totalInterest;

        if (monthlyRate === 0) {

            monthlyPayment = loanAmount / term;
            totalPayment = loanAmount;
            totalInterest = 0;

        } else {

            const compoundFactor = Math.pow(
                1 + monthlyRate,
                term
            );

            monthlyPayment =
                loanAmount *
                (monthlyRate * compoundFactor) /
                (compoundFactor - 1);

            totalPayment = monthlyPayment * term;
            totalInterest = totalPayment - loanAmount;
        }

        // STEP 6: Generate Payment Schedule
        const paymentSchedule = [];
        let remainingBalance = loanAmount;

        for (
            let month = 1;
            month <= Math.min(6, term);
            month++
        ) {

            const interestPayment =
                remainingBalance * monthlyRate;

            const principalPayment =
                monthlyPayment - interestPayment;

            remainingBalance -= principalPayment;

            paymentSchedule.push({
                month: month,
                payment: Math.round(monthlyPayment),
                principal: Math.round(principalPayment),
                interest: Math.round(interestPayment),
                remainingBalance: Math.max(
                    0,
                    Math.round(remainingBalance)
                )
            });
        }

        // STEP 7: Return results
        res.json({
            success: true,

            inputs: {
                carPrice: price,
                downPayment: down,
                loanAmount: loanAmount,
                interestRate: rate,
                loanTermMonths: term
            },

            results: {
                monthlyPayment: Math.round(monthlyPayment),
                totalPayment: Math.round(totalPayment),
                totalInterest: Math.round(totalInterest),
                paymentSchedule: paymentSchedule,
                currency: 'UGX'
            }
        });

    } catch (error) {

        console.error('Calculation error:', error);

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// ============================================
// USER STORY 2: Dealership Localization
// ============================================

// GET /api/dealership/location

app.get('/api/dealership/location', (req, res) => {

    try {

        const dealershipInfo = {

            success: true,

            dealership: {

                name: 'Panda Motors Ltd',

                description:
                    'Uganda\'s trusted luxury vehicle importer',

                address: {
                    street: 'Banda, Jinja Road',
                    city: 'Kampala',
                    district: 'Kampala District',
                    country: 'Uganda',
                    fullAddress:
                        'Banda, Jinja Road, Kampala, Uganda'
                },

                location: {
                    latitude: 0.3488,
                    longitude: 32.6160,
                    zoom: 15
                },

                operatingHours: {

                    monday: {
                        open: '08:00',
                        close: '18:00',
                        isOpen: true
                    },

                    tuesday: {
                        open: '08:00',
                        close: '18:00',
                        isOpen: true
                    },

                    wednesday: {
                        open: '08:00',
                        close: '18:00',
                        isOpen: true
                    },

                    thursday: {
                        open: '08:00',
                        close: '18:00',
                        isOpen: true
                    },

                    friday: {
                        open: '08:00',
                        close: '18:00',
                        isOpen: true
                    },

                    saturday: {
                        open: '09:00',
                        close: '17:00',
                        isOpen: true
                    },

                    sunday: {
                        open: '00:00',
                        close: '00:00',
                        isOpen: false,
                        note: 'Closed'
                    }
                },

                contact: {

                    phone: [
                        '+256 770 826 951',
                        '+256 756 053 475'
                    ],

                    whatsapp: '+256 770 826 951',

                    email: 'sales@pandamotors.co.ug'
                },

                services: [
                    'URA Duty Clearance',
                    'Import Documentation',
                    'Certified Workshop',
                    'Flexible Financing'
                ],

                googleMapsUrl:
                    'https://maps.google.com/?q=Banda,+Jinja+Road,+Kampala,+Uganda',

                directionsUrl:
                    'https://maps.google.com/dir//Banda,+Jinja+Road,+Kampala,+Uganda',

                embedMapUrl:
                    'https://maps.google.com/maps?q=Banda+Kampala+Uganda&z=15&output=embed'
            }
        };

        res.json(dealershipInfo);

    } catch (error) {

        console.error('Location error:', error);

        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// ============================================
// BONUS: Dealership Open Status Endpoint
// ============================================

// GET /api/dealership/status

app.get('/api/dealership/status', (req, res) => {

    const now = new Date();

    const dayNames = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday'
    ];

    const currentDay = dayNames[now.getDay()];

    const currentTime = now.toLocaleTimeString(
        'en-US',
        {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        }
    );

    const hours = {

        monday: {
            open: '08:00',
            close: '18:00'
        },

        tuesday: {
            open: '08:00',
            close: '18:00'
        },

        wednesday: {
            open: '08:00',
            close: '18:00'
        },

        thursday: {
            open: '08:00',
            close: '18:00'
        },

        friday: {
            open: '08:00',
            close: '18:00'
        },

        saturday: {
            open: '09:00',
            close: '17:00'
        },

        sunday: {
            open: '00:00',
            close: '00:00'
        }
    };

    const todayHours = hours[currentDay];

    const isOpen =
        currentDay !== 'sunday' &&
        currentTime >= todayHours.open &&
        currentTime <= todayHours.close;

    res.json({

        success: true,

        currentTime: currentTime,

        currentDay: currentDay,

        isOpen: isOpen,

        operatingHours: todayHours,

        message: isOpen
            ? 'We are currently open! Visit us today.'
            : 'We are closed. Please visit during business hours.'
    });
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

// GET /api/health

app.get('/api/health', (req, res) => {

    res.json({

        status: 'OK',

        timestamp: new Date().toISOString(),

        message: 'Panda Motors API is running!',

        version: '2.0.0',

        endpoints: [

            'POST /api/finance/calculate - Calculate loan payments',

            'GET /api/dealership/location - Get dealership location',

            'GET /api/dealership/status - Check if open',

            'POST /api/bookings/create - Book test drive',

            'GET /api/bookings/check-availability - Check availability',

            'GET /api/bookings/user/:user_id - Get user bookings',

            'PUT /api/bookings/:id/cancel - Cancel booking',

            'GET /api/admin/stats - Full admin statistics',

            'GET /api/admin/stats/summary - Quick summary',

            'GET /api/optimized/search - Optimized inventory search',

            'GET /api/optimized/availability - Quick availability check',

            'GET /api/optimized/stats - Inventory statistics',

            'GET /api/optimized/most-searched - Most searched makes',

            'GET /api/optimized/performance - Query performance report',

            'GET /api/admin/metrics - Full admin dashboard metrics',

            'GET /api/admin/metrics/inventory - Inventory metrics only',

            'GET /api/admin/metrics/bookings - Booking metrics only',

            'GET /api/health - Health check'
        ]
    });
});

// ============================================
// DATABASE INITIALIZATION
// ============================================

try {
    const { default: pool, verifyDatabaseConnection } =
        await import("./config/db.js");

    const result = await verifyDatabaseConnection();

    if (!result.connected) {
        throw new Error(
            result.error?.message || "Database connection failed"
        );
    }

    console.log("PostgreSQL database connection verified");

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("Users table verified");

    console.log("Database initialization complete");
} catch (error) {
    console.error(
        "Database initialization failed:",
        error.message
    );
}

app.get("/", (req, res) => {
    res.json({
        message: "Panda Motors API is running",
    });
});


// ============================================
// START THE SERVER
// ============================================

app.listen(PORT, async () => {
    console.log("========================================");
    console.log("Panda Motors API Server");
    console.log("========================================");
    console.log(`Server running on: http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

    // Initialize database
    console.log("Database initialization verified.");


    // Start test drive reminder background job
    startTestDriveReminderJob();

    console.log('\nAvailable Endpoints:');

    console.log('   --- Financial ---');

    console.log(
        `   POST /api/finance/calculate  - Loan calculator`
    );

    console.log('   --- Dealership ---');

    console.log(
        `   GET  /api/dealership/location - Store location`
    );

    console.log(
        `   GET  /api/dealership/status   - Open status`
    );

    console.log('   --- Test Drive Booking ---');

    console.log(
        `   POST /api/bookings/create - Book test drive with conflict logic`
    );

    console.log(
        `   GET  /api/bookings/check-availability - Check availability`
    );

    console.log(
        `   GET  /api/bookings/user/:user_id - Get user bookings`
    );

    console.log(
        `   PUT  /api/bookings/:id/cancel - Cancel booking`
    );

    console.log('   --- Admin Analytics ---');

    console.log(
        `   GET  /api/admin/stats - Full admin statistics`
    );

    console.log(
        `   GET  /api/admin/stats/summary - Quick summary`
    );

    console.log(
        '   --- Performance & Optimized Queries (NEW) ---'
    );

    console.log(
        `   GET  /api/optimized/search - Optimized inventory search`
    );

    console.log(
        `   GET  /api/optimized/availability - Quick availability check`
    );

    console.log(
        `   GET  /api/optimized/stats - Inventory statistics`
    );

    console.log(
        `   GET  /api/optimized/most-searched - Most searched makes`
    );

    console.log(
        `   GET  /api/optimized/performance - Query performance report`
    );

    console.log(
        '   --- Admin Metrics Dashboard (NEW) ---'
    );

    console.log(
        `   GET  /api/admin/metrics - Full admin dashboard metrics`
    );

    console.log(
        `   GET  /api/admin/metrics/inventory - Inventory metrics only`
    );

    console.log(
        `   GET  /api/admin/metrics/bookings - Booking metrics only`
    );

    console.log('   --- Health ---');

    console.log(
        `   GET  /api/health - Health check`
    );

    console.log('========================================\n');
});