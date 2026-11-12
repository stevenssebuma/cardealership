// backend/tests/integration/bookingRouteContract.integration.test.js
//
// Guards how the booking router is composed: nothing customer-scoped may be
// mounted without authentication, and the booking identity (plus the address the
// confirmation is mailed to) must always come from the verified token.
//
// The route and controller modules are inspected as source because the contract
// is about *which middleware wraps which handler*, which a request-level test
// cannot pin down once the middleware passes. This file replaces the earlier
// `bookingRouteContract.test.js`, which asserted a router and controller shape
// that no longer existed and was never collected by jest's testMatch pattern.

import { beforeAll, describe, expect, jest, test } from "@jest/globals";
import fs from "node:fs";

// The controllers pull in the pool through the session middleware; a double
// keeps this contract test independent of a live database.
jest.unstable_mockModule("../../config/db.js", () => ({
  default: {
    query: async () => ({ rows: [], rowCount: 0 }),
    on: () => {},
  },
  withTransaction: async (callback) =>
    callback({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} }),
  verifyDatabaseConnection: async () => ({ connected: true }),
  initializeDatabase: async () => {},
}));

const readSource = (relativePath) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

const routeSource = readSource("../../routes/bookingRoutes.js");
const controllerSource = readSource("../../controllers/bookingController.js");
const serverSource = readSource("../../server.js");

const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let protect;
let authenticateToken;

beforeAll(async () => {
  const auth = await import("../../middleware/authMiddleware.js");
  protect = auth.protect;
  authenticateToken = auth.authenticateToken;
});

describe("booking route contract", () => {
  test("protect is the canonical authentication middleware", () => {
    expect(protect).toBe(authenticateToken);
  });

  test("slot availability stays a public lookup", () => {
    expect(routeSource).toMatch(
      /router\.get\(\s*'\/check-availability',\s*getAvailability\s*\)/,
    );
  });

  test("every customer-scoped route requires a token", () => {
    const protectedRoutes = [
      ["post", "/create", "createBooking"],
      ["get", "/me", "getMyBookings"],
      ["get", "/user/:user_id", "getUserBookings"],
      ["put", "/:id/cancel", "cancelBooking"],
    ];

    for (const [method, path, handler] of protectedRoutes) {
      const pattern = new RegExp(
        `router\\.${method}\\(\\s*'${escapeForRegExp(path)}',\\s*rateLimitProtectedRoute,\\s*authenticateToken,\\s*${handler}\\s*,?\\s*\\)`,
      );

      expect(routeSource).toMatch(pattern);
    }
  });

  test("the router is mounted once and keeps no inline booking handlers", () => {
    expect(serverSource.split("app.use('/api/bookings'").length - 1).toBe(1);
    expect(
      /app\.(get|post|put|patch|delete)\(['"]\/api\/bookings/.test(serverSource),
    ).toBe(false);
  });

  test("booking identity is read from the token, never from the request body", () => {
    expect(controllerSource).toContain("const numericUserId = authenticatedUserId;");
    expect(controllerSource).not.toMatch(/Number\(\s*user_id\s*\)/);
    expect((controllerSource.match(/req\.user\?\.id/g) ?? []).length).toBeGreaterThanOrEqual(
      3,
    );
  });

  test("the confirmation address comes from the account, not the body", () => {
    expect(controllerSource).toContain("user_email: accountEmail,");
    expect(controllerSource).not.toMatch(/typeof\s+user_email\s*===/);
  });
});
