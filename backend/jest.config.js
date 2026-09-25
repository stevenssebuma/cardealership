// backend/jest.config.js
//
// Configuration for the Sprint 6 API integration testing suite.
//
// The backend is an ES module project, so the suite runs Jest through
// --experimental-vm-modules (see the "test" script in package.json) and
// transforms are disabled because no compilation step is required.

/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.integration.test.js"],
  // Loads backend/.env and app-safe test defaults before any app module is
  // imported, so JWT_SECRET and provider settings are available at import time.
  setupFiles: ["<rootDir>/tests/setup/env.setup.js"],
  transform: {},
  testTimeout: 30000,
  verbose: true,
};
