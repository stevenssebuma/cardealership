// backend/tests/setup/env.setup.js
//
// Runs before the test framework and before any application module is
// imported. It loads backend/.env and applies test-safe defaults so the
// integration suite never binds a conflicting port and never starts the real
// reminder scheduler.

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendEnvPath = path.resolve(currentDirectory, "..", "..", ".env");

dotenv.config({ path: backendEnvPath });

process.env.NODE_ENV = process.env.NODE_ENV || "test";
// Port 0 lets the operating system assign a free port during test runs.
process.env.PORT = "0";
process.env.TEST_DRIVE_REMINDER_ENABLED = "false";

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "integration-test-secret";
}
