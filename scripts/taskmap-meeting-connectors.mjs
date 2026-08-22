#!/usr/bin/env node

import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
} from "node:path";
import { pathToFileURL } from "node:url";

export const TASKMAP_MEETING_CONNECTOR_READINESS_VERSION =
  "taskmap-meeting-connector-readiness.v1";

const CONFIG_MAX_BYTES = 256 * 1_024;
const TOKEN_MAX_BYTES = 64 * 1_024;
const PRODUCER_MAX_BYTES = 256 * 1_024;
const RUNTIME_FILE_MAX_BYTES = 2 * 1_024 * 1_024;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function boundedOwnerId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return (
    normalized.length > 0
    && Buffer.byteLength(normalized, "utf8") <= 1_024
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  );
}

function safePrivateJson(filePath, maximumBytes) {
  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch (error) {
    return { state: error?.code === "ENOENT" ? "absent" : "unsafe" };
  }

  try {
    const before = fstatSync(descriptor);
    const currentUid = typeof process.getuid === "function"
      ? process.getuid()
      : before.uid;
    if (
      !before.isFile()
      || before.uid !== currentUid
      || before.nlink !== 1
      || (before.mode & 0o777) !== 0o600
      || before.size < 2
      || before.size > maximumBytes
    ) {
      return { state: "unsafe" };
    }

    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      bytes.byteLength !== before.size
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      return { state: "unsafe" };
    }

    try {
      const value = JSON.parse(bytes.toString("utf8"));
      return isPlainObject(value)
        ? { state: "ready", value }
        : { state: "invalid" };
    } catch {
      return { state: "invalid" };
    }
  } finally {
    closeSync(descriptor);
  }
}

function safeRuntimeFile(filePath) {
  let descriptor;
  try {
    descriptor = openSync(
      filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch (error) {
    return {
      state: error?.code === "ENOENT" ? "absent" : "unsafe",
      text: null,
      modifiedAtMs: null,
      size: null,
    };
  }

  try {
    const before = fstatSync(descriptor);
    const currentUid = typeof process.getuid === "function"
      ? process.getuid()
      : before.uid;
    if (
      !before.isFile()
      || before.uid !== currentUid
      || before.nlink !== 1
      || (before.mode & 0o022) !== 0
      || before.size < 1
      || before.size > RUNTIME_FILE_MAX_BYTES
    ) {
      return {
        state: "unsafe",
        text: null,
        modifiedAtMs: null,
        size: null,
      };
    }

    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      bytes.byteLength !== before.size
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      return {
        state: "unsafe",
        text: null,
        modifiedAtMs: null,
        size: null,
      };
    }
    return {
      state: "ready",
      text: bytes.toString("utf8"),
      modifiedAtMs: before.mtimeMs,
      size: before.size,
    };
  } finally {
    closeSync(descriptor);
  }
}

function ownerIdentityReadiness(config) {
  if (config.state === "unsafe") return "unsafe";
  if (config.state === "invalid") return "invalid";
  if (config.state !== "ready" || !nonblank(config.value.user_id)) {
    return "missing";
  }
  return boundedOwnerId(config.value.user_id) ? "ready" : "invalid";
}

function gdocsReadiness(config, token, ownerIdentity) {
  if (config.state === "unsafe" || token.state === "unsafe") return "unsafe";
  if (config.state === "invalid" || token.state === "invalid") return "invalid";
  if (ownerIdentity !== "ready") return "blocked_owner_identity";
  if (
    config.state !== "ready"
    || !nonblank(config.value.gdocs_client_id)
    || !nonblank(config.value.gdocs_client_secret)
    || !nonblank(config.value.gdocs_folder_id)
  ) {
    return "missing_configuration";
  }
  if (token.state === "absent") return "missing_token";
  if (token.state !== "ready" || !nonblank(token.value.access_token)) {
    return "invalid";
  }
  return "ready";
}

function granolaReadiness(token) {
  if (token.state === "unsafe") return "unsafe";
  if (token.state === "invalid") return "invalid";
  if (token.state === "absent") return "not_configured";
  return token.state === "ready" && nonblank(token.value.access_token)
    ? "ready"
    : "invalid";
}

function plaudReadiness(runtimeRoot) {
  const client = safeRuntimeFile(
    join(runtimeRoot, "scripts", "plaud-mcp-client.mjs"),
  );
  if (
    client.state === "ready"
    && client.text.includes("@plaud-ai/mcp")
    && client.text.includes("--non-interactive")
  ) {
    // Presence proves only packaged capability. A live provider claim still
    // requires a successful owner-triggered snapshot receipt.
    return "available_unverified";
  }
  return "unavailable_optional";
}

function runtimeDirectoryState(directoryPath) {
  try {
    const metadata = lstatSync(directoryPath);
    const currentUid = typeof process.getuid === "function"
      ? process.getuid()
      : metadata.uid;
    return (
      metadata.isDirectory()
      && !metadata.isSymbolicLink()
      && metadata.uid === currentUid
      && (metadata.mode & 0o022) === 0
    )
      ? "ready"
      : "unsafe";
  } catch (error) {
    return error?.code === "ENOENT" ? "absent" : "unsafe";
  }
}

function inspectRuntime(runtimeRoot, daemonPath) {
  let resolvedRoot;
  let resolvedEngineDirectory;
  try {
    resolvedRoot = realpathSync(runtimeRoot);
    resolvedEngineDirectory = realpathSync(dirname(runtimeRoot));
  } catch (error) {
    return {
      capability: error?.code === "ENOENT"
        ? "runtime_missing"
        : "runtime_unsafe",
    };
  }

  const relativeRuntime = relative(resolvedEngineDirectory, resolvedRoot);
  if (
    relativeRuntime.length === 0
    || relativeRuntime === ".."
    || relativeRuntime.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(relativeRuntime)
  ) {
    return { capability: "runtime_unsafe" };
  }

  const runtimeDirectories = [
    resolvedRoot,
    join(resolvedRoot, "scripts"),
    join(resolvedRoot, "dist"),
    join(resolvedRoot, "dist", "src"),
    join(resolvedRoot, "dist", "src", "engine"),
    join(resolvedRoot, "dist", "src", "engine", "taskmap"),
    dirname(daemonPath),
  ];
  const directoryStates = runtimeDirectories.map(runtimeDirectoryState);
  if (directoryStates.includes("unsafe")) {
    return { capability: "runtime_unsafe" };
  }
  if (directoryStates.includes("absent")) {
    return { capability: "capability_missing" };
  }

  const gdocs = safeRuntimeFile(
    join(resolvedRoot, "scripts", "gdocs-client.mjs"),
  );
  const modulePath = join(
    resolvedRoot,
    "dist",
    "src",
    "engine",
    "taskmap",
    "meeting-producer-freshness.js",
  );
  const producerModule = safeRuntimeFile(modulePath);
  const daemon = safeRuntimeFile(daemonPath);
  if (
    gdocs.state === "unsafe"
    || producerModule.state === "unsafe"
    || daemon.state === "unsafe"
  ) {
    return { capability: "runtime_unsafe" };
  }
  if (
    gdocs.state !== "ready"
    || producerModule.state !== "ready"
    || daemon.state !== "ready"
  ) {
    return { capability: "capability_missing" };
  }
  if (
    !gdocs.text.includes("--export-taskmap-producer")
    || !gdocs.text.includes("includeTabsContent")
    || !daemon.text.includes("run_meeting_producers")
    || !daemon.text.includes("MEETING_PRODUCER_INTERVAL_SECONDS=14400")
    || !daemon.text.includes("--export-taskmap-producer")
  ) {
    return { capability: "capability_missing" };
  }
  return { capability: "capability_unverified" };
}

function artifactPresence(snapshot) {
  if (snapshot.state === "absent") return "absent";
  if (snapshot.state === "unsafe") return "unsafe";
  return "present";
}

function nextActionFor({
  ownerIdentity,
  gdocs,
  runtime,
  artifact,
}) {
  if (
    ownerIdentity === "unsafe"
    || gdocs === "unsafe"
    || runtime === "runtime_unsafe"
    || artifact.presence === "unsafe"
  ) {
    return "repair_unsafe_local_state";
  }
  if (
    ownerIdentity === "invalid"
    || gdocs === "invalid"
  ) {
    return "repair_invalid_local_state";
  }
  if (ownerIdentity === "missing") return "configure_owner_identity";
  if (runtime === "capability_unverified") return "verify_m2_runtime";
  if (runtime !== "ready") return "install_m2_runtime";
  if (gdocs === "missing_configuration") return "configure_gdocs";
  if (gdocs === "missing_token") return "login_gdocs";
  if (gdocs !== "ready") return "repair_invalid_local_state";
  if (artifact.presence === "absent") return "produce_snapshot";
  if (
    artifact.currentness === "boundary_due"
    || artifact.currentness === "stale"
  ) {
    return "refresh_snapshot";
  }
  if (artifact.currentness === "not_validated") return "validate_snapshot";
  return "ready";
}

function optionalGranolaAction(readiness) {
  if (readiness === "ready") return "none";
  if (readiness === "not_configured") return "login_granola_mcp_optional";
  return "repair_granola_mcp_optional";
}

function normalizedAbsolutePath(value, label) {
  if (
    typeof value !== "string"
    || !isAbsolute(value)
    || value.includes("\0")
  ) {
    throw new Error(`${label} must be an absolute local path`);
  }
  return normalize(value);
}

export function inspectTaskMapMeetingConnectors({
  homeDirectory = homedir(),
  runtimeRoot,
} = {}) {
  const ownerHome = normalizedAbsolutePath(homeDirectory, "homeDirectory");
  const installedRuntimeRoot = normalizedAbsolutePath(
    runtimeRoot
      ?? join(
        ownerHome,
        "Library",
        "Application Support",
        "DaoBrew",
        "engine",
        "current",
      ),
    "runtimeRoot",
  );
  const config = safePrivateJson(
    join(ownerHome, ".daobrew", "config.json"),
    CONFIG_MAX_BYTES,
  );
  const gdocsToken = safePrivateJson(
    join(
      ownerHome,
      "Library",
      "Application Support",
      "DaoBrew",
      "gdocs-token.json",
    ),
    TOKEN_MAX_BYTES,
  );
  const granolaToken = safePrivateJson(
    join(
      ownerHome,
      "Library",
      "Application Support",
      "DaoBrew",
      "granola-mcp-token.json",
    ),
    TOKEN_MAX_BYTES,
  );
  const snapshotPath = join(
    ownerHome,
    ".daobrew",
    "taskmap",
    "meeting-producer-snapshot.v1.json",
  );
  const snapshot = safePrivateJson(snapshotPath, PRODUCER_MAX_BYTES);
  const installedDaemonPath = join(
    ownerHome,
    ".daobrew",
    "daobrew-ingest-daemon.sh",
  );

  const ownerIdentity = ownerIdentityReadiness(config);
  const granola = granolaReadiness(granolaToken);
  const plaud = plaudReadiness(installedRuntimeRoot);
  const runtime = inspectRuntime(
    installedRuntimeRoot,
    installedDaemonPath,
  );
  const gdocs = gdocsReadiness(config, gdocsToken, ownerIdentity);
  const artifact = {
    presence: artifactPresence(snapshot),
    currentness: "not_validated",
  };

  const readyForLocalProduction = false;
  const nextAction = nextActionFor({
    ownerIdentity,
    gdocs,
    runtime: runtime.capability,
    artifact,
  });

  return {
    contractVersion: TASKMAP_MEETING_CONNECTOR_READINESS_VERSION,
    ownerIdentity: { readiness: ownerIdentity },
    gdocsPrimary: { readiness: gdocs },
    granolaMcp: {
      readiness: granola,
      required: false,
    },
    plaudMcp: {
      readiness: plaud,
      required: false,
    },
    packagedM2Producer: { capability: runtime.capability },
    currentProducerArtifact: artifact,
    readyForLocalProduction,
    nextAction,
    optionalGranolaAction: optionalGranolaAction(granola),
    privacy: {
      providerCallsPerformed: false,
      mutationsPerformed: false,
      identifiersReturned: false,
      pathsReturned: false,
      credentialsReturned: false,
    },
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/taskmap-meeting-connectors.mjs [--status]",
    "",
    "Reports local, privacy-safe meeting producer readiness.",
    "It never contacts a provider or changes local state.",
  ].join("\n");
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url
      === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  if (
    argv.length > 1
    || (argv.length === 1 && argv[0] !== "--status")
  ) {
    throw new Error("invalid invocation");
  }
  console.log(JSON.stringify(await inspectTaskMapMeetingConnectors(), null, 2));
}

if (isMainModule()) {
  main(process.argv.slice(2)).catch(() => {
    console.error(JSON.stringify({
      contractVersion: TASKMAP_MEETING_CONNECTOR_READINESS_VERSION,
      status: "unavailable",
      errorKind: "local_readiness_check_failed",
    }));
    process.exit(1);
  });
}
