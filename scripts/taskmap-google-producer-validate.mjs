#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertTaskMapMeetingProducerSnapshot,
  taskMapMeetingProducerOwnerScopeDigest,
} from "../dist/src/engine/taskmap/meeting-producer-freshness.js";
import {
  assertTaskMapGoogleCalendarProviderSnapshot,
  taskMapCalendarOwnerScopeDigest,
} from "../dist/src/engine/taskmap/calendar-producer-freshness.js";

const MAX_SNAPSHOT_BYTES = 256 * 1_024;
const MAX_CONFIG_BYTES = 64 * 1_024;
const CANONICAL_UUID =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

function confirmedOwnerUserId(
  environment = process.env,
  homeDirectory = homedir(),
) {
  const explicit = (environment.DAOBREW_USER_ID ?? "").trim();
  if (!CANONICAL_UUID.test(explicit)) {
    throw new Error("confirmed owner identity is unavailable");
  }
  const config = readOwnerOnlyJson(
    join(homeDirectory, ".daobrew", "config.json"),
    MAX_CONFIG_BYTES,
    { requireMode: false },
  );
  const configured = typeof config?.user_id === "string"
    ? config.user_id.trim()
    : "";
  const credential = typeof config?.device_credential === "string"
    ? config.device_credential.trim()
    : "";
  if (
    configured !== explicit
    || config?.device_credential_confirmed !== true
    || !credential.startsWith("dbd_")
    || credential.length < 32
  ) {
    throw new Error("confirmed owner identity changed");
  }
  return explicit;
}

function readOwnerOnlyJson(
  filePath,
  maximumBytes,
  { requireMode = true } = {},
) {
  if (!isAbsolute(filePath) || normalize(filePath) !== filePath) {
    throw new Error("producer snapshot path is invalid");
  }
  const stats = lstatSync(filePath);
  if (
    !stats.isFile()
    || stats.isSymbolicLink()
    || stats.size <= 1
    || stats.size > maximumBytes
    || (typeof process.getuid === "function" && stats.uid !== process.getuid())
    || (requireMode && (stats.mode & 0o777) !== 0o600)
  ) {
    throw new Error("producer snapshot file authentication failed");
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function assertCurrent(producedAt, validThrough, assessedAt, label) {
  const produced = Date.parse(producedAt);
  const valid = Date.parse(validThrough);
  const assessed = Date.parse(assessedAt);
  if (
    !Number.isFinite(assessed)
    || assessed < produced
    || assessed >= valid
  ) {
    throw new Error(`${label} snapshot is not current`);
  }
}

export function validateTaskMapGoogleProducerSnapshotValues({
  meetingSnapshot,
  calendarSnapshot,
  ownerUserId,
  assessedAt,
}) {
  if (!CANONICAL_UUID.test(ownerUserId)) {
    throw new Error("producer owner identity is not canonical");
  }
  if (meetingSnapshot === undefined && calendarSnapshot === undefined) {
    throw new Error("at least one producer snapshot is required");
  }
  if (meetingSnapshot !== undefined) {
    assertTaskMapMeetingProducerSnapshot(meetingSnapshot);
    if (
      meetingSnapshot.ownerScopeDigest
        !== taskMapMeetingProducerOwnerScopeDigest(ownerUserId)
    ) {
      throw new Error("meeting producer owner does not match");
    }
    assertCurrent(
      meetingSnapshot.producedAt,
      meetingSnapshot.validThrough,
      assessedAt,
      "meeting producer",
    );
  }
  if (calendarSnapshot !== undefined) {
    assertTaskMapGoogleCalendarProviderSnapshot(
      calendarSnapshot,
      taskMapCalendarOwnerScopeDigest(ownerUserId),
    );
    assertCurrent(
      calendarSnapshot.producedAt,
      calendarSnapshot.validThrough,
      assessedAt,
      "Google Calendar",
    );
  }
}

function parseArgs(argv) {
  const options = { meeting: undefined, calendar: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--meeting") {
      options.meeting = argv[++index];
    } else if (argument === "--calendar") {
      options.calendar = argv[++index];
    } else {
      throw new Error("unsupported validator argument");
    }
  }
  if (!options.meeting && !options.calendar) {
    throw new Error("validator snapshot path is required");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const ownerUserId = confirmedOwnerUserId();
  const assessedAt = new Date().toISOString();
  const meetingSnapshot = options.meeting
    ? readOwnerOnlyJson(options.meeting, MAX_SNAPSHOT_BYTES)
    : undefined;
  const calendarSnapshot = options.calendar
    ? readOwnerOnlyJson(options.calendar, MAX_SNAPSHOT_BYTES)
    : undefined;
  validateTaskMapGoogleProducerSnapshotValues({
    meetingSnapshot,
    calendarSnapshot,
    ownerUserId,
    assessedAt,
  });
  process.stdout.write(`${JSON.stringify({ status: "validated" })}\n`);
}

const invokedAsMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === normalize(process.argv[1])
  : false;
if (invokedAsMain) {
  try {
    main();
  } catch {
    process.stdout.write(`${JSON.stringify({ status: "unavailable" })}\n`);
    process.exitCode = 1;
  }
}
