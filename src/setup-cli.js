#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  canonicalUserId,
  setupCliAnchorEnrollment,
} = require("./cli-anchor-enrollment.js");

const DEFAULT_API_URL = "https://daobrew-backend-iaupcwo6dq-uw.a.run.app/api/v1";

function configFile() {
  return process.env.DAOBREW_CONFIG_FILE || path.join(os.homedir(), ".daobrew", "config.json");
}

function migrationWriterFenceFile() {
  return path.join(
    os.userInfo().homedir,
    ".daobrew",
    "gcp-migration-writer-fence.json",
  );
}

function migrationWriterLeaseDirectory() {
  return path.join(
    os.userInfo().homedir,
    ".daobrew",
    "gcp-migration-writer-leases",
  );
}

function migrationWriterFenceExists(markerPath = migrationWriterFenceFile()) {
  try {
    fs.lstatSync(markerPath);
    return true;
  } catch (error) {
    return error?.code !== "ENOENT";
  }
}

function acquireMigrationWriterLease({
  markerPath = migrationWriterFenceFile(),
  leaseDirectory = migrationWriterLeaseDirectory(),
} = {}) {
  requireMigrationWriterFenceInactive(markerPath);
  try {
    fs.mkdirSync(leaseDirectory, { recursive: true, mode: 0o700 });
    const directoryMetadata = fs.lstatSync(leaseDirectory);
    if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
      throw new Error("unsafe directory");
    }
    fs.chmodSync(leaseDirectory, 0o700);
  } catch {
    throw new Error("Migration writer lease directory is unavailable; sync remains paused.");
  }
  const leasePath = path.join(
    leaseDirectory,
    `cli-memory-${process.pid}-${crypto.randomUUID()}.lease`,
  );
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let descriptor;
  try {
    descriptor = fs.openSync(
      leasePath,
      fs.constants.O_WRONLY
        | fs.constants.O_CREAT
        | fs.constants.O_EXCL
        | noFollow,
      0o600,
    );
  } catch {
    throw new Error("Migration writer lease is unavailable; sync remains paused.");
  }
  fs.closeSync(descriptor);
  fs.chmodSync(leasePath, 0o600);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      fs.unlinkSync(leasePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  };
  try {
    requireMigrationWriterFenceInactive(markerPath);
  } catch (error) {
    release();
    throw error;
  }
  return { release };
}

function requireMigrationWriterFenceInactive(markerPath = migrationWriterFenceFile()) {
  if (migrationWriterFenceExists(markerPath)) {
    throw new Error("Database migration writer fence is active; sync remains paused.");
  }
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  const file = configFile();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function helperPath() {
  const candidates = [
    path.join(__dirname, "..", "..", "scripts", "ingest-daemon-helper.mjs"),
    path.join(__dirname, "..", "scripts", "ingest-daemon-helper.mjs"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("ingest-daemon-helper.mjs not found");
  return found;
}

function installationNonce() {
  return `dbi_cli_${crypto.randomUUID().replace(/-/g, "")}_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function setupCli() {
  const existing = readConfig();
  if (
    typeof existing.device_credential === "string"
    && existing.device_credential.startsWith("dbd_")
    && existing.device_credential_confirmed === true
    && canonicalUserId(existing.user_id) === existing.user_id
  ) {
    console.log("DaoBrew CLI is already enrolled.");
    return;
  }
  const hasPersistedConfirmedCredential = typeof existing.device_credential === "string"
    && existing.device_credential.startsWith("dbd_")
    && existing.device_credential_confirmed === true;
  const apiUrl = hasPersistedConfirmedCredential
    ? (existing.api_url || DEFAULT_API_URL)
    : (process.env.DAOBREW_API_URL || existing.api_url || DEFAULT_API_URL);
  const userId = canonicalUserId(existing.user_id)
    || crypto.randomUUID().toUpperCase();
  const nonce = existing.installation_nonce || installationNonce();
  await setupCliAnchorEnrollment({
    apiUrl,
    existing,
    fetchImpl: fetch,
    installationNonce: nonce,
    platform: process.platform,
    surface: "cli",
    userId,
    writeConfig,
  });
  console.log("DaoBrew CLI setup complete.");
}

async function syncMemory() {
  const lease = acquireMigrationWriterLease();
  try {
    const config = readConfig();
    const apiUrl = config.api_url || DEFAULT_API_URL;
    const credential = config.device_credential;
    if (typeof credential !== "string" || !credential.startsWith("dbd_")) {
      throw new Error("Missing confirmed dbd_ device credential. Run `daobrew setup` first.");
    }
    const helper = helperPath();
    const args = [helper, "memory-ingest-body"];
    if (process.env.DAOBREW_MEMORY_HOME) args.push(process.env.DAOBREW_MEMORY_HOME);
    const generated = spawnSync(process.execPath, args, { encoding: "utf8" });
    if (generated.status !== 0) throw new Error("Could not parse local memory transcripts.");
    const body = JSON.parse(generated.stdout || "{\"rows\":[]}");
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      console.log("DaoBrew memory sync skipped: no transcript rows found.");
      return;
    }
    const chunkRows = 100;
    for (let index = 0; index < rows.length; index += chunkRows) {
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/memory/ingest`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${credential}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ rows: rows.slice(index, index + chunkRows) }),
      });
      if (!response.ok) throw new Error(`Memory sync failed with HTTP ${response.status}`);
    }
    console.log("DaoBrew memory sync complete.");
  } finally {
    lease.release();
  }
}

function installAgent() {
  const command = `${process.execPath} ${process.argv[1]} sync-memory`;
  if (process.platform !== "darwin") {
    console.log(`Cron recipe: */10 * * * * ${command} >/tmp/daobrew-sync-memory.log 2>&1`);
    return;
  }
  const stdoutPath = path.join(os.homedir(), ".daobrew", "logs", "cli-memory.log");
  const stderrPath = path.join(os.homedir(), ".daobrew", "logs", "cli-memory.err.log");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>app.daobrew.cli-memory</string>
  <key>ProgramArguments</key><array><string>${xmlEscape(process.execPath)}</string><string>${xmlEscape(process.argv[1])}</string><string>sync-memory</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xmlEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(stderrPath)}</string>
</dict></plist>
`;
  const launchAgents = process.env.DAOBREW_LAUNCH_AGENTS_DIR || path.join(os.homedir(), "Library", "LaunchAgents");
  fs.mkdirSync(launchAgents, { recursive: true });
  fs.writeFileSync(path.join(launchAgents, "app.daobrew.cli-memory.plist"), plist, { mode: 0o600 });
  console.log("DaoBrew launchd agent installed. Load it with launchctl from your user session.");
}

async function main() {
  const command = process.argv[2];
  if (!command) return require("./setup.js").default();
  if (command === "setup") return setupCli();
  if (command === "sync-memory") return syncMemory();
  if (command === "install-agent") return installAgent();
  throw new Error(`Unknown daobrew command: ${command}`);
}

module.exports = {
  setupCli,
  syncMemory,
  installAgent,
  main,
  xmlEscape,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}
