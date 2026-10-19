import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, "..");
const environmentPath = path.join(backendRoot, ".env.test");

const usingEmbeddedDatabase = process.env.API_TEST_EMBEDDED_RUNNER === "true";
if (!usingEmbeddedDatabase && !fs.existsSync(environmentPath)) {
  throw new Error(
    "backend/.env.test is required. Copy .env.test.example and provide a dedicated local test database URL.",
  );
}

if (!usingEmbeddedDatabase) {
  dotenv.config({ path: environmentPath, override: true, quiet: true });
}
process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required. Refusing to run API tests without an isolated test database.",
  );
}

const databaseName = new URL(process.env.TEST_DATABASE_URL).pathname.replace(
  /^\//,
  "",
);
if (!/test/i.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL must name a database containing 'test'.");
}

const testDirectory = path.join(backendRoot, "tests", "api");
const testFiles = fs
  .readdirSync(testDirectory)
  .filter((name) => name.endsWith(".test.js"))
  .map((name) => path.join(testDirectory, name));

if (testFiles.length === 0) {
  throw new Error("No API test files were found.");
}

const child = spawn(
  process.execPath,
  ["--test", ...process.argv.slice(2), ...testFiles],
  {
    cwd: backendRoot,
    env: process.env,
    stdio: "inherit",
  },
);

child.once("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
