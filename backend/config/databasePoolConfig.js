const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SSL_REQUIRE = new Set(["true", "require", "verify-ca", "verify-full"]);
const SSL_DISABLE = new Set(["false", "disable"]);
const TEST_NAME = /(?:^|[_-])test(?:[_-]|$)/i;

const configError = (message) => Object.assign(new Error(message), {
  code: "DATABASE_CONFIG_INVALID",
});

function decode(value, label) {
  try {
    const decoded = decodeURIComponent(value);
    if (/[\u0000-\u001f\u007f]/u.test(decoded)) throw new Error();
    return decoded;
  } catch {
    throw configError(`${label} contains invalid URL encoding or control characters.`);
  }
}

function parseDatabaseUrl(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw configError(`${label} is required.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw configError(`${label} must be a valid PostgreSQL URL.`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || !url.username || url.hash) {
    throw configError(`${label} must specify PostgreSQL, a host, a user and a database.`);
  }
  // Arbitrary connection options can override the host, DB or TLS settings.
  for (const key of url.searchParams.keys()) {
    if (key !== "sslmode" || url.searchParams.getAll(key).length !== 1) {
      throw configError(`${label} contains an unsupported connection option.`);
    }
  }
  const database = decode(url.pathname.slice(1), label);
  if (!database || database.includes("/")) {
    throw configError(`${label} must name exactly one database.`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw configError(`${label} specifies an invalid port.`);
  }
  return {
    host, port, database,
    user: decode(url.username, label),
    password: decode(url.password, label),
    sslmode: url.searchParams.get("sslmode") || "",
  };
}

function targetKey(config) {
  const host = LOCAL_HOSTS.has(config.host) ? "loopback" : config.host;
  return JSON.stringify([host, config.port, config.database]);
}

function integerSetting(env, key, fallback, min, max) {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(String(raw))) {
    throw configError(`${key} must be an integer.`);
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw configError(`${key} must be between ${min} and ${max}.`);
  }
  return value;
}

function sslConfig(target, env) {
  const local = LOCAL_HOSTS.has(target.host);
  const explicit = String(env.DATABASE_SSL || target.sslmode ||
    env.PGSSLMODE || env.DB_SSL || env.PGSSL || "").trim().toLowerCase();
  const network = env.DATABASE_NETWORK || "standard";

  // Render documents self-signed certificates on its internal database URL.
  // Allow that provider-specific trust boundary only by explicit opt-in,
  // inside a Render service, for a single-label private DNS hostname.
  // Public/external hostnames never qualify for this exception.
  if (network === "render-private") {
    if (env.RENDER !== "true" || local || !/^[a-z][a-z0-9-]+$/.test(target.host)) {
      throw configError("Render private mode requires a Render service and an internal database hostname.");
    }
    if (explicit && !["require", "true"].includes(explicit)) {
      throw configError("Render private mode requires encrypted transport (sslmode=require).");
    }
    if (env.DATABASE_SSL_CA) {
      throw configError("Use standard verified TLS mode when supplying a trusted CA.");
    }
    return { rejectUnauthorized: false };
  }
  if (network !== "standard") {
    throw configError("Unsupported DATABASE_NETWORK.");
  }
  if (!explicit && local) return false;
  if (SSL_DISABLE.has(explicit)) {
    if (!local) throw configError("TLS cannot be disabled for a non-loopback database.");
    return false;
  }
  if (explicit && !SSL_REQUIRE.has(explicit)) {
    throw configError("Unsupported PostgreSQL SSL mode; use verified TLS or local disable.");
  }
  const ssl = { rejectUnauthorized: true };
  if (env.DATABASE_SSL_CA) ssl.ca = env.DATABASE_SSL_CA;
  return ssl;
}

export function buildPoolConfig(env = process.env) {
  const isTest = env.NODE_ENV === "test";
  const label = isTest ? "TEST_DATABASE_URL" : "DATABASE_URL";
  const target = parseDatabaseUrl(env[label], label);
  if (env.NODE_ENV === "staging" &&
      (env.STAGING_DATABASE_NAME !== target.database ||
       !/(?:^|[_-])(?:stage|staging)(?:[_-]|$)/i.test(target.database) ||
       /(?:^|[_-])(?:prod|production|live)(?:[_-]|$)/i.test(target.database))) {
    throw configError("Staging requires an explicitly confirmed dedicated staging database.");
  }
  if (isTest) {
    if (!TEST_NAME.test(target.database)) {
      throw configError("TEST_DATABASE_URL must identify a dedicated test database.");
    }
    if (env.DATABASE_URL) {
      const nonTest = parseDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");
      if (targetKey(nonTest) === targetKey(target)) {
        throw configError("TEST_DATABASE_URL must not target the non-test database.");
      }
    }
  }
  return {
    host: target.host,
    port: target.port,
    database: target.database,
    user: target.user,
    password: target.password,
    ssl: sslConfig(target, env),
    max: integerSetting(env, "DB_POOL_MAX", 5, 1, 50),
    connectionTimeoutMillis: integerSetting(env, "DB_CONNECT_TIMEOUT_MS", 10000, 100, 120000),
    idleTimeoutMillis: integerSetting(env, "DB_IDLE_TIMEOUT_MS", 30000, 100, 600000),
    statement_timeout: integerSetting(env, "DB_STATEMENT_TIMEOUT_MS", 15000, 100, 600000),
    idle_in_transaction_session_timeout: integerSetting(
      env, "DB_TRANSACTION_IDLE_TIMEOUT_MS", 30000, 100, 600000,
    ),
    keepAlive: true,
    application_name: "cardealership-backend",
  };
}
