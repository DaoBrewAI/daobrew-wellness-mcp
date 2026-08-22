"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const calendar_producer_freshness_js_1 = require("../src/engine/taskmap/calendar-producer-freshness.js");
const source_contracts_js_1 = require("../src/engine/taskmap/source-contracts.js");
const PRODUCED_AT = "2026-07-30T12:00:00.000Z";
const CURRENT_AT = "2026-07-30T15:59:59.999Z";
const OWNER_USER_ID = "14802294-BEED-480E-ABF6-7E3703FA25CD";
const OTHER_OWNER_USER_ID = "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1";
const OWNER = (0, calendar_producer_freshness_js_1.taskMapCalendarOwnerScopeDigest)(OWNER_USER_ID);
const OTHER_OWNER = (0, calendar_producer_freshness_js_1.taskMapCalendarOwnerScopeDigest)(OTHER_OWNER_USER_ID);
function digest(value) {
    return (0, source_contracts_js_1.taskMapContractDigest)({
        domain: "taskmap-calendar-test.1",
        value,
    });
}
function event(name, startAt = "2026-07-30T13:00:00.000Z", crossProviderIdentityDigest = null) {
    const eventIdentityDigest = digest(`event:${name}`);
    const title = `Synthetic ${name}`;
    const endAt = new Date(Date.parse(startAt) + 30 * 60 * 1_000).toISOString();
    return {
        eventIdentityDigest,
        crossProviderIdentityDigest,
        revisionDigest: (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [eventIdentityDigest, title, startAt, endAt]),
        title,
        startAt,
        endAt,
    };
}
function write0600(filePath, value) {
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(node_path_1.default.dirname(filePath), 0o700);
    (0, node_fs_1.writeFileSync)(filePath, (0, source_contracts_js_1.taskMapContractCanonicalJson)(value), { mode: 0o600 });
    (0, node_fs_1.chmodSync)(filePath, 0o600);
}
function writeRaw0600(filePath, value) {
    (0, node_fs_1.mkdirSync)(node_path_1.default.dirname(filePath), { recursive: true, mode: 0o700 });
    (0, node_fs_1.chmodSync)(node_path_1.default.dirname(filePath), 0o700);
    (0, node_fs_1.writeFileSync)(filePath, value, { mode: 0o600 });
    (0, node_fs_1.chmodSync)(filePath, 0o600);
}
function paths(root) {
    return {
        localExportPath: node_path_1.default.join(root, "calendar-export.json"),
        googleSnapshotPath: node_path_1.default.join(root, "google-calendar.json"),
    };
}
(0, node_test_1.describe)("Task Map Calendar producer freshness", () => {
    (0, node_test_1.it)("rejects noncanonical and duplicate-key local and Google artifacts", async () => {
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-calendar-canonical-"));
        try {
            const files = paths(root);
            const local = (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [event("local-canonical")],
            });
            const google = (0, calendar_producer_freshness_js_1.buildTaskMapGoogleCalendarProviderSnapshot)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [event("google-canonical")],
            });
            for (const [provider, filePath, artifact] of [
                ["local_calendar", files.localExportPath, local],
                ["google_calendar", files.googleSnapshotPath, google],
            ]) {
                const canonical = provider === "local_calendar"
                    ? (0, calendar_producer_freshness_js_1.taskMapLocalCalendarExportCanonicalJson)(local)
                    : (0, calendar_producer_freshness_js_1.taskMapGoogleCalendarProviderSnapshotCanonicalJson)(google);
                const variants = [
                    `${canonical}\n`,
                    JSON.stringify(artifact),
                    canonical.replace("{", `{"contractVersion":"${artifact.contractVersion}",`),
                ];
                for (const bytes of variants) {
                    writeRaw0600(filePath, bytes);
                    const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                        ...files,
                        assessedAt: CURRENT_AT,
                        expectedOwnerScopeDigest: OWNER,
                    });
                    strict_1.default.equal(result.providers.find((row) => row.provider === provider)?.freshness, "malformed");
                }
                (0, node_fs_1.rmSync)(filePath);
            }
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("freezes the cross-language length-framed digest vectors", () => {
        const eventIdentityDigest = (0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_GOOGLE_CALENDAR_EVENT_IDENTITY_DOMAIN, [
            "primary",
            "provider-id-1",
            "2026-07-30T20:00:00.000Z",
        ]);
        strict_1.default.equal(eventIdentityDigest, "8bfc5a853ef0d5512b0e363e9dd1feeaa0a2f7cee1dcde14d8c34fb09c429a13");
        strict_1.default.equal((0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_CROSS_PROVIDER_IDENTITY_DOMAIN, ["shared-ical-1", "2026-07-30T20:00:00.000Z"]), "74f3e063bb81394c35cfbce313657661ea7f13be84823d2ac88749309eacc6fc");
        strict_1.default.equal((0, calendar_producer_freshness_js_1.taskMapCalendarFieldDigest)(calendar_producer_freshness_js_1.TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN, [
            eventIdentityDigest,
            "Review the launch checklist",
            "2026-07-30T20:00:00.000Z",
            "2026-07-30T20:30:00.000Z",
        ]), "2e5d6347085b3add80b4778d94e9d4d26e66699b18bef4482e66fee53760a3f2");
    });
    (0, node_test_1.it)("builds exact four-hour local and Google snapshots, including empty current reads", () => {
        const local = (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
            ownerScopeDigest: OWNER,
            producedAt: PRODUCED_AT,
            events: [],
        });
        strict_1.default.equal(local.ownerScopeDigest, OWNER);
        strict_1.default.equal(Date.parse(local.validThrough) - Date.parse(local.producedAt), calendar_producer_freshness_js_1.TASKMAP_CALENDAR_MAX_AGE_MS);
        strict_1.default.deepEqual(local.events, []);
        const google = (0, calendar_producer_freshness_js_1.buildTaskMapGoogleCalendarProviderSnapshot)({
            ownerScopeDigest: OWNER,
            producedAt: PRODUCED_AT,
            events: [event("google")],
        });
        strict_1.default.equal(Date.parse(google.validThrough) - Date.parse(google.producedAt), calendar_producer_freshness_js_1.TASKMAP_CALENDAR_MAX_AGE_MS);
        strict_1.default.equal(google.events.length, 1);
        strict_1.default.equal(google.privacy.boundedTitlesStored, true);
        strict_1.default.equal(google.privacy.rawProviderIdsStored, false);
    });
    (0, node_test_1.it)("rejects a coordinated title change that preserves a stale revision digest", () => {
        const original = event("launch-review");
        strict_1.default.throws(() => (0, calendar_producer_freshness_js_1.buildTaskMapGoogleCalendarProviderSnapshot)({
            ownerScopeDigest: OWNER,
            producedAt: PRODUCED_AT,
            events: [{
                    ...original,
                    title: "Changed launch review",
                }],
        }), /revisionDigest does not match its event fields/);
    });
    (0, node_test_1.it)("reports both providers missing without treating markers as current", async () => {
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-calendar-missing-"));
        try {
            const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...paths(root),
                assessedAt: CURRENT_AT,
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.equal(result.contractVersion, calendar_producer_freshness_js_1.TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION);
            strict_1.default.equal(result.availability, "unavailable");
            strict_1.default.deepEqual(result.providers.map((provider) => provider.freshness), ["missing", "missing"]);
            strict_1.default.deepEqual(result.events, []);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("keeps a fresh local/iCloud read usable when Google is unconfigured", async () => {
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-calendar-local-"));
        try {
            const files = paths(root);
            write0600(files.localExportPath, (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [event("icloud")],
            }));
            const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...files,
                assessedAt: CURRENT_AT,
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.equal(result.availability, "available");
            strict_1.default.deepEqual(result.providers.map((provider) => [
                provider.provider,
                provider.freshness,
            ]), [
                ["local_calendar", "current"],
                ["google_calendar", "missing"],
            ]);
            strict_1.default.equal(result.events.length, 1);
            strict_1.default.equal(result.events[0].provider, "local_calendar");
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("prefers direct Google on an exact cross-provider identity and retains unmatched local events", async () => {
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-calendar-dedupe-"));
        try {
            const files = paths(root);
            const cross = digest("same-google-occurrence");
            write0600(files.localExportPath, (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [
                    event("eventkit-google-copy", undefined, cross),
                    event("icloud-only"),
                ],
            }));
            write0600(files.googleSnapshotPath, (0, calendar_producer_freshness_js_1.buildTaskMapGoogleCalendarProviderSnapshot)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [event("direct-google", undefined, cross)],
            }));
            const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...files,
                assessedAt: CURRENT_AT,
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.equal(result.availability, "available");
            strict_1.default.equal(result.events.length, 2);
            strict_1.default.equal(result.events.find((row) => row.crossProviderIdentityDigest === cross)?.provider, "google_calendar");
            strict_1.default.equal(result.events.some((row) => row.eventIdentityDigest === digest("event:icloud-only")
                && row.provider === "local_calendar"), true);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("uses a half-open four-hour window and excludes stale provider events", async () => {
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-calendar-age-"));
        try {
            const files = paths(root);
            write0600(files.localExportPath, (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [event("local")],
            }));
            write0600(files.googleSnapshotPath, (0, calendar_producer_freshness_js_1.buildTaskMapGoogleCalendarProviderSnapshot)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [event("google")],
            }));
            const boundary = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...files,
                assessedAt: "2026-07-30T16:00:00.000Z",
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.equal(boundary.availability, "unavailable");
            strict_1.default.deepEqual(boundary.providers.map((provider) => provider.freshness), ["boundary_due", "boundary_due"]);
            strict_1.default.deepEqual(boundary.events, []);
            const stale = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...files,
                assessedAt: "2026-07-30T16:00:00.001Z",
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.deepEqual(stale.providers.map((provider) => provider.freshness), ["stale", "stale"]);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("fails Google closed on owner/digest mismatch while preserving a valid local provider", async () => {
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-calendar-owner-"));
        try {
            const files = paths(root);
            write0600(files.localExportPath, (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [],
            }));
            const google = (0, calendar_producer_freshness_js_1.buildTaskMapGoogleCalendarProviderSnapshot)({
                ownerScopeDigest: OTHER_OWNER,
                producedAt: PRODUCED_AT,
                events: [event("google")],
            });
            write0600(files.googleSnapshotPath, google);
            const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...files,
                assessedAt: CURRENT_AT,
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.equal(result.availability, "available");
            strict_1.default.deepEqual(result.providers.map((provider) => provider.freshness), ["current", "malformed"]);
            strict_1.default.deepEqual(result.events, []);
            write0600(files.googleSnapshotPath, {
                ...(0, calendar_producer_freshness_js_1.buildTaskMapGoogleCalendarProviderSnapshot)({
                    ownerScopeDigest: OWNER,
                    producedAt: PRODUCED_AT,
                    events: [event("google")],
                }),
                snapshotDigest: digest("forged"),
            });
            const forged = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...files,
                assessedAt: CURRENT_AT,
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.equal(forged.providers[1].freshness, "malformed");
            (0, node_fs_1.rmSync)(files.googleSnapshotPath, { force: true });
            write0600(files.localExportPath, (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                ownerScopeDigest: OTHER_OWNER,
                producedAt: PRODUCED_AT,
                events: [event("wrong-owner-local")],
            }));
            const wrongLocalOwner = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...files,
                assessedAt: CURRENT_AT,
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.equal(wrongLocalOwner.availability, "unavailable");
            strict_1.default.deepEqual(wrongLocalOwner.providers.map((provider) => provider.freshness), ["malformed", "missing"]);
            strict_1.default.deepEqual(wrongLocalOwner.events, []);
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects over-capacity and non-owner-only provider files", async () => {
        const tooMany = Array.from({ length: 257 }, (_, index) => event(`event-${index}`, new Date(Date.parse("2026-07-30T13:00:00.000Z") + index * 60_000).toISOString()));
        strict_1.default.throws(() => (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
            ownerScopeDigest: OWNER,
            producedAt: PRODUCED_AT,
            events: tooMany,
        }), /event limit/);
        const root = (0, node_fs_1.mkdtempSync)(node_path_1.default.join((0, node_os_1.tmpdir)(), "taskmap-calendar-mode-"));
        try {
            const files = paths(root);
            write0600(files.localExportPath, (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [event("local")],
            }));
            (0, node_fs_1.chmodSync)(files.localExportPath, 0o644);
            const result = await (0, calendar_producer_freshness_js_1.loadTaskMapCalendarProducerResult)({
                ...files,
                assessedAt: CURRENT_AT,
                expectedOwnerScopeDigest: OWNER,
            });
            strict_1.default.equal(result.providers[0].freshness, "malformed");
            strict_1.default.equal(result.availability, "unavailable");
        }
        finally {
            (0, node_fs_1.rmSync)(root, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)("rejects private or executable-looking calendar titles", () => {
        const base = event("private");
        for (const title of [
            "Email owner@example.com",
            "Use token=secret-value",
            "Open https://example.com/private",
            "Read /Users/synthetic/private.txt",
        ]) {
            strict_1.default.throws(() => (0, calendar_producer_freshness_js_1.buildTaskMapLocalCalendarExport)({
                ownerScopeDigest: OWNER,
                producedAt: PRODUCED_AT,
                events: [{ ...base, title }],
            }), /bounded title privacy policy/);
        }
    });
    (0, node_test_1.it)("derives the fixed Google artifact path without accepting relative homes", () => {
        strict_1.default.equal((0, calendar_producer_freshness_js_1.taskMapGoogleCalendarProviderSnapshotPath)("/tmp/synthetic-home"), "/tmp/synthetic-home/.daobrew/taskmap/calendar-google-provider-snapshot.v1.json");
        strict_1.default.throws(() => (0, calendar_producer_freshness_js_1.taskMapGoogleCalendarProviderSnapshotPath)("relative-home"), /normalized and absolute/);
    });
});
