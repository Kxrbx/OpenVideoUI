import { access, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const MIN_NODE_MAJOR = 24;
const DEFAULTS = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://studio:studio@localhost:5432/studio",
  REDIS_URL: "redis://localhost:6379",
  ASSET_STORAGE_DIR: ".data/assets",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1"
};

const results = [];

function addResult(status, label, message, action) {
  results.push({ status, label, message, action });
}

function parseEnvText(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

async function readLocalEnv() {
  try {
    const text = await readFile(path.join(root, ".env"), "utf8");
    return parseEnvText(text);
  } catch {
    return {};
  }
}

function getEnv(localEnv) {
  return {
    ...DEFAULTS,
    ...localEnv,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => typeof value === "string")
    )
  };
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);

  if (major >= MIN_NODE_MAJOR) {
    addResult("ok", "Node.js", `Node ${process.versions.node} is supported.`);
    return;
  }

  addResult(
    "error",
    "Node.js",
    `Node ${process.versions.node} is too old.`,
    `Install Node.js ${MIN_NODE_MAJOR}+ and rerun npm install.`
  );
}

async function checkEnvShape(env) {
  try {
    await access(path.join(root, ".env.example"));
    addResult("ok", "Environment template", ".env.example is present.");
  } catch {
    addResult("error", "Environment template", ".env.example is missing.");
  }

  if (env.OPENROUTER_API_KEY) {
    addResult("ok", "OpenRouter key", "A server-side OpenRouter key is configured.");
  } else {
    addResult(
      "warn",
      "OpenRouter key",
      "OPENROUTER_API_KEY is empty.",
      "Add it to .env, or save a browser-local key during onboarding."
    );
  }

  for (const [name, value] of [
    ["DATABASE_URL", env.DATABASE_URL],
    ["REDIS_URL", env.REDIS_URL],
    ["OPENROUTER_BASE_URL", env.OPENROUTER_BASE_URL]
  ]) {
    try {
      new URL(value);
      addResult("ok", name, `${name} is parseable.`);
    } catch {
      addResult("error", name, `${name} is not a valid URL.`);
    }
  }
}

function probeTcp(urlText, label) {
  return new Promise((resolve) => {
    let url;

    try {
      url = new URL(urlText);
    } catch {
      addResult("error", label, `${label} URL is invalid.`);
      resolve(false);
      return;
    }

    const port = Number(url.port || (url.protocol.startsWith("redis") ? 6379 : 5432));
    const socket = net.createConnection({ host: url.hostname, port });
    const timer = setTimeout(() => {
      socket.destroy();
      addResult("warn", label, `${label} is not reachable at ${url.hostname}:${port}.`);
      resolve(false);
    }, 1500);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      addResult("ok", label, `${label} is reachable at ${url.hostname}:${port}.`);
      resolve(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      addResult("warn", label, `${label} is not reachable at ${url.hostname}:${port}.`);
      resolve(false);
    });
  });
}

async function checkStorage(env) {
  const storageRoot = path.isAbsolute(env.ASSET_STORAGE_DIR)
    ? env.ASSET_STORAGE_DIR
    : path.resolve(root, env.ASSET_STORAGE_DIR);
  const tempPath = path.join(storageRoot, `.doctor-${process.pid}.tmp`);

  try {
    await mkdir(storageRoot, { recursive: true });
    await writeFile(tempPath, "ok", { flag: "wx" });
    await unlink(tempPath);
    addResult("ok", "Asset storage", "ASSET_STORAGE_DIR is writable.");
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    addResult(
      "error",
      "Asset storage",
      "ASSET_STORAGE_DIR is not writable.",
      error instanceof Error ? error.message : undefined
    );
  }
}

async function checkMigrations() {
  try {
    const files = await readdir(path.join(root, "drizzle"));
    const migrations = files.filter((file) => /^\d+_.+\.sql$/.test(file));

    if (migrations.length > 0) {
      addResult("ok", "Migrations", `${migrations.length} migration files are present.`);
    } else {
      addResult("error", "Migrations", "No Drizzle migration files were found.");
    }
  } catch {
    addResult("error", "Migrations", "The drizzle migration directory is missing.");
  }
}

async function checkModelSync(env, databaseReachable) {
  if (!databaseReachable) {
    addResult(
      "warn",
      "Model sync",
      "Model capability rows were not checked because Postgres is unavailable."
    );
    return;
  }

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    const result = await pool.query("select count(*)::int as count, max(synced_at) as latest from model_capabilities");
    await pool.end();
    const count = Number(result.rows[0]?.count ?? 0);

    if (count > 0) {
      addResult("ok", "Model sync", `${count} model capabilities are stored.`);
    } else {
      addResult(
        "warn",
        "Model sync",
        "No model capabilities are stored.",
        "Run npm run sync:models after configuring OpenRouter."
      );
    }
  } catch (error) {
    addResult(
      "warn",
      "Model sync",
      "Model capability rows could not be checked.",
      error instanceof Error ? error.message : undefined
    );
  }
}

function printResults() {
  const icon = {
    ok: "[ok]",
    warn: "[warn]",
    error: "[error]"
  };

  console.log(`OpenVideoUI doctor (${os.platform()} ${os.release()})`);

  for (const result of results) {
    console.log(`${icon[result.status]} ${result.label}: ${result.message}`);

    if (result.action) {
      console.log(`       ${result.action}`);
    }
  }
}

const localEnv = await readLocalEnv();
const env = getEnv(localEnv);

checkNodeVersion();
await checkEnvShape(env);
const databaseReachable = await probeTcp(env.DATABASE_URL, "Postgres");
await probeTcp(env.REDIS_URL, "Redis");
await checkStorage(env);
await checkMigrations();
await checkModelSync(env, databaseReachable);
printResults();

if (results.some((result) => result.status === "error")) {
  process.exitCode = 1;
}
