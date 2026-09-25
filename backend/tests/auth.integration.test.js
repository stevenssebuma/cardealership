// backend/tests/auth.integration.test.js
//
// Sprint 6 - Task 2: API integration testing suite (Jest + Supertest)
//
// These tests exercise the real Express application (routes, middleware and JWT
// signing) while the PostgreSQL pool is replaced by an in-memory double, so the
// suite runs deterministically without a live database.

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

const VALID_PASSWORD = "Sprint6Password";
const hashedPassword = bcrypt.hashSync(VALID_PASSWORD, 12);

const customerRow = {
  id: 42,
  name: "Registered Customer",
  email: "customer@pandamotors.test",
  password: hashedPassword,
  role: "user",
  phone: "+256700000001",
  created_at: "2026-01-05T08:00:00.000Z",
  updated_at: "2026-01-05T08:00:00.000Z",
};

const adminRow = {
  ...customerRow,
  id: 7,
  name: "Panda Admin",
  email: "admin@pandamotors.test",
  role: "admin",
  phone: null,
};

let userTable = [customerRow, adminRow];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return (
    userTable.find((user) => user.email.toLowerCase() === normalizedEmail) ||
    null
  );
}

function findUserById(id) {
  return userTable.find((user) => String(user.id) === String(id)) || null;
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

const queryMock = jest.fn(async (sql, params = []) => {
  const text = normalizeSql(sql);

  if (/^SELECT id FROM users/i.test(text)) {
    const existingUser = findUserByEmail(params[0]);
    return { rows: existingUser ? [{ id: existingUser.id }] : [] };
  }

  if (/^INSERT INTO users/i.test(text)) {
    const insertedRow = {
      id: userTable.length + 100,
      name: params[0] || "",
      email: normalizeEmail(params[1]),
      password: params[2],
      role: "user",
      phone: params[3] ?? null,
      created_at: "2026-09-22T09:00:00.000Z",
      updated_at: "2026-09-22T09:00:00.000Z",
    };

    userTable = [...userTable, insertedRow];

    return { rows: [insertedRow] };
  }

  if (/^UPDATE users/i.test(text)) {
    const userId = params[params.length - 1];
    const existingUser = findUserById(userId);

    if (!existingUser) {
      return { rows: [] };
    }

    return { rows: [existingUser] };
  }

  if (/WHERE LOWER\(email\)/i.test(text)) {
    const existingUser = findUserByEmail(params[0]);
    return { rows: existingUser ? [existingUser] : [] };
  }

  if (/WHERE id = \$1/i.test(text)) {
    const existingUser = findUserById(params[0]);
    return { rows: existingUser ? [existingUser] : [] };
  }

  return { rows: [] };
});

// The database module is replaced before the application is imported so no
// connection to PostgreSQL is attempted.
jest.unstable_mockModule("../config/db.js", () => ({
  default: { query: queryMock, on: () => {} },
  verifyDatabaseConnection: async () => ({
    connected: true,
    database: "integration_test",
    time: new Date(),
  }),
  initializeDatabase: async () => {},
}));

let app;
let httpServer;
let generateToken;

beforeAll(async () => {
  const serverModule = await import("../server.js");
  const authMiddlewareModule = await import("../middleware/authMiddleware.js");

  app = serverModule.default;
  httpServer = serverModule.httpServer;
  generateToken = authMiddlewareModule.generateToken;
});

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
});

describe("POST /api/auth/register", () => {
  test("creates a user and never returns the password hash", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "New Sprint Six Customer",
      email: "New.Customer@PandaMotors.test",
      password: VALID_PASSWORD,
      phone: "+256700000123",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toMatchObject({
      name: "New Sprint Six Customer",
      email: "new.customer@pandamotors.test",
      role: "user",
      phone: "+256700000123",
    });
    expect(response.body.user).not.toHaveProperty("password");
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.split(".")).toHaveLength(3);
  });

  test("rejects a registration without email or password", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "Incomplete Customer" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Email and password are required");
  });

  test("rejects a password shorter than six characters", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Weak Password",
      email: "weak@pandamotors.test",
      password: "12345",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Password must be at least 6 characters");
  });

  test("rejects a duplicate email address", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Duplicate Customer",
      email: customerRow.email,
      password: VALID_PASSWORD,
    });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "An account with this email already exists"
    );
  });
});

describe("POST /api/auth/login", () => {
  test("logs in an existing user and returns a JWT", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: customerRow.email, password: VALID_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Login successful");
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.split(".")).toHaveLength(3);
    expect(response.body.user).not.toHaveProperty("password");

    const decodedToken = jwt.decode(response.body.token);

    expect(decodedToken).toMatchObject({
      id: customerRow.id,
      email: customerRow.email,
      role: "user",
    });
    expect(typeof decodedToken.exp).toBe("number");
  });

  test("rejects a wrong password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: customerRow.email, password: "WrongPassword" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  test("rejects an unknown email address", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "missing@pandamotors.test", password: VALID_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });
});

describe("Admin route protection", () => {
  test("fails when no token is provided", async () => {
    const response = await request(app).get("/api/admin/stats");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("fails when the token is not a valid JWT", async () => {
    const response = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", "Bearer not-a-real-token");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });

  test("fails when a customer token is used", async () => {
    const customerToken = generateToken(customerRow);
    const response = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ADMIN_ACCESS_REQUIRED");
    expect(response.body.error.details.yourRole).toBe("user");
  });

  test("succeeds when an admin token is used", async () => {
    const adminToken = generateToken(adminRow);
    const response = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.stats).toBeDefined();
  });
});

describe("Profile routes used by the profile page", () => {
  test("GET /api/users/me requires a token", async () => {
    const response = await request(app).get("/api/users/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("GET /api/users/me returns the authenticated profile", async () => {
    const token = generateToken(customerRow);
    const response = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toMatchObject({
      id: customerRow.id,
      email: customerRow.email,
      role: "user",
    });
    expect(response.body.user).not.toHaveProperty("password");
  });

  test("PATCH /api/users/me updates the authenticated profile", async () => {
    const token = generateToken(customerRow);
    const response = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Updated Name", phone: "+256700000999" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toBeDefined();
    expect(response.body.user).not.toHaveProperty("password");
  });

  test("PATCH /api/users/me rejects an empty payload", async () => {
    const token = generateToken(customerRow);
    const response = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("At least one field is required");
  });
});
