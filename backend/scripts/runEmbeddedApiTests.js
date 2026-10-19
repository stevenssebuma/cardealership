import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import EmbeddedPostgres from "embedded-postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(here, "..");
const databaseName = "panda_motors_embedded_test";
const databaseUser = "panda_motors_test";
const runId = `${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`;
const databaseDirectory = path.join(
  os.tmpdir(),
  `panda-motors-api-test-${runId}`,
);
const execFileAsync = promisify(execFile);

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function runNodeScript(script, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(here, script), ...args], {
      cwd: backendRoot,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal || code !== 0) reject(new Error(`${script} failed.`));
      else resolve();
    });
  });
}

async function stopTemporaryDatabase(postgres) {
  const binaryPackage = {
    "darwin-arm64": "@embedded-postgres/darwin-arm64",
    "darwin-x64": "@embedded-postgres/darwin-x64",
    "linux-arm": "@embedded-postgres/linux-arm",
    "linux-arm64": "@embedded-postgres/linux-arm64",
    "linux-ia32": "@embedded-postgres/linux-ia32",
    "linux-ppc64": "@embedded-postgres/linux-ppc64",
    "linux-x64": "@embedded-postgres/linux-x64",
    "win32-x64": "@embedded-postgres/windows-x64",
  }[`${process.platform}-${process.arch}`];

  try {
    if (!binaryPackage)
      throw new Error("Unsupported embedded PostgreSQL platform.");
    const { pg_ctl } = await import(binaryPackage);
    await execFileAsync(
      pg_ctl,
      ["stop", "-D", databaseDirectory, "-m", "immediate", "-w"],
      {
        windowsHide: true,
      },
    );
  } catch {
    const processId = postgres.process?.pid;
    if (processId) {
      const command = process.platform === "win32" ? "taskkill" : "kill";
      const arguments_ =
        process.platform === "win32"
          ? ["/pid", String(processId), "/f", "/t"]
          : ["-9", String(processId)];
      await execFileAsync(command, arguments_, { windowsHide: true }).catch(
        () => {},
      );
    }
  } finally {
    // embedded-postgres also registers an exit hook. Mark its process stopped so
    // that hook cannot repeat the Windows shutdown attempt after pg_ctl succeeds.
    postgres.process = undefined;
  }
}

async function main() {
  const port = await availablePort();
  const password = randomBytes(24).toString("base64url");
  const testUrl = `postgresql://${databaseUser}:${encodeURIComponent(password)}@127.0.0.1:${port}/${databaseName}`;
  const environment = {
    ...process.env,
    API_TEST_EMBEDDED_RUNNER: "true",
    API_TEST_SILENT_DATABASE_ERRORS: "true",
    JWT_SECRET: randomBytes(32).toString("base64url"),
    NODE_ENV: "test",
    TEST_DATABASE_SSL: "false",
    TEST_DATABASE_URL: testUrl,
  };
  delete environment.DATABASE_URL;

  const postgres = new EmbeddedPostgres({
    databaseDir: databaseDirectory,
    password,
    persistent: false,
    port,
    user: databaseUser,
    onError: (error) => console.error("Embedded PostgreSQL:", error),
    onLog: () => {},
  });

  try {
    console.log("Starting an isolated temporary PostgreSQL database...");
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase(databaseName);
    await runNodeScript("bootstrapApiTestDatabase.js", environment);
    await runNodeScript("prepareApiTestDatabase.js", environment);
    await runNodeScript("runApiTests.js", environment, process.argv.slice(2));
  } finally {
    await stopTemporaryDatabase(postgres);
    await fs.rm(databaseDirectory, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error("API test setup failed:", error.message);
  process.exitCode = 1;
});
