import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pg from "pg";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, "..");
const developmentEnvironment = dotenv.parse(
  fs.readFileSync(path.join(backendRoot, ".env.development")),
);
const testEnvironmentPath = path.join(backendRoot, ".env.test");

if (!fs.existsSync(testEnvironmentPath)) {
  throw new Error(
    "backend/.env.test is required before copying the development schema.",
  );
}

const testEnvironment = dotenv.parse(fs.readFileSync(testEnvironmentPath));
if (
  !developmentEnvironment.DATABASE_URL ||
  !testEnvironment.TEST_DATABASE_URL
) {
  throw new Error(
    "DATABASE_URL and TEST_DATABASE_URL are required for schema setup.",
  );
}

const developmentUrl = new URL(developmentEnvironment.DATABASE_URL);
const testUrl = new URL(testEnvironment.TEST_DATABASE_URL);
const developmentDatabase = developmentUrl.pathname.replace(/^\//, "");
const testDatabase = testUrl.pathname.replace(/^\//, "");

if (!/test/i.test(testDatabase) || developmentDatabase === testDatabase) {
  throw new Error(
    "The target must be a separate database whose name contains 'test'.",
  );
}

const targetPool = new pg.Pool({
  connectionString: testEnvironment.TEST_DATABASE_URL,
  ssl:
    testEnvironment.TEST_DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : false,
});

try {
  const tables = await targetPool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  if (tables.rowCount > 0) {
    throw new Error(
      "The local test database is not empty. Refusing to overwrite it. Recreate the local test volume before copying a fresh schema.",
    );
  }
} finally {
  await targetPool.end();
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}.`));
    });
  });
}

const dump = spawn(
  "docker",
  [
    "run",
    "--rm",
    "--env",
    "PGPASSWORD",
    "--env",
    "PGSSLMODE",
    "postgres:18-alpine",
    "pg_dump",
    "--host",
    developmentUrl.hostname,
    "--port",
    developmentUrl.port || "5432",
    "--username",
    decodeURIComponent(developmentUrl.username),
    "--dbname",
    developmentDatabase,
    "--schema-only",
    "--no-owner",
    "--no-privileges",
  ],
  {
    cwd: backendRoot,
    env: {
      ...process.env,
      PGPASSWORD: decodeURIComponent(developmentUrl.password),
      PGSSLMODE:
        developmentEnvironment.DATABASE_SSL === "true" ? "require" : "disable",
    },
    stdio: ["ignore", "pipe", "inherit"],
  },
);

const restore = spawn(
  "docker",
  [
    "compose",
    "-f",
    "docker-compose.test.yml",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    testEnvironment.POSTGRES_USER,
    "-d",
    testEnvironment.POSTGRES_DB,
  ],
  {
    cwd: backendRoot,
    stdio: ["pipe", "inherit", "inherit"],
  },
);

dump.stdout.pipe(restore.stdin);
await Promise.all([
  waitForExit(dump, "Schema export"),
  waitForExit(restore, "Schema restore"),
]);
console.log(
  "Development schema copied to the empty local test database. No application data was copied.",
);
