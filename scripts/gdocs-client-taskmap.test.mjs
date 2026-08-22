import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  GDOCS_PROVIDER_RESPONSE_MAX_BYTES,
  GOOGLE_CALENDAR_READONLY_SCOPE,
  TASKMAP_GOOGLE_CALENDAR_MAX_EVENTS,
  assertGoogleCalendarReadScope,
  buildGdocsExportResponse,
  buildTaskMapGoogleCalendarEventRows,
  buildTaskMapSnapshotWithOptionalGranola,
  confirmedTaskMapProducerUserId,
  buildTaskMapGdocsMeetingDraft,
  docsGetUrl,
  exportGoogleCalendarProducer,
  extractTaskMapMeetingEvidence,
  extractTaskMapMeetingEvidenceFromGoogleDoc,
  gdocsArgvRequestsTaskMapProducer,
  getToken,
  googleCalendarEventsListUrl,
  listGoogleCalendarEvents,
  listFolderDocs,
  loadTaskMapGranolaVariants,
  parseArgs,
  readBoundedProviderJson,
  readAuthenticatedGranolaSnapshot,
  reportGdocsDocumentReadFailure,
  serializeGdocsTopLevelFailure,
  shouldExportGdocsSnapshot,
  taskMapCanonicalJson,
  taskMapGranolaVariants,
  tokenHasGoogleCalendarReadScope,
  writeOwnerOnlyTaskMapSnapshot,
} from "./gdocs-client.mjs";

const OBSERVED_AT = "2026-07-29T20:00:00.000Z";
const FILE = {
  id: "synthetic-owner-doc",
  name: "Synthetic owner meeting",
  createdTime: "2026-07-29T16:00:00.000Z",
  modifiedTime: "2026-07-29T17:00:00.000Z",
};

function paragraph(
  namedStyleType,
  text,
  {
    isListItem = false,
    bullet = false,
    elements,
    suggestedInsertionIds,
  } = {},
) {
  return {
    paragraph: {
      paragraphStyle: { namedStyleType },
      ...(isListItem ? { isListItem: true } : {}),
      ...(bullet ? { bullet: { listId: "synthetic-list" } } : {}),
      elements: elements ?? [{
        textRun: {
          content: `${text}\n`,
          ...(suggestedInsertionIds
            ? { suggestedInsertionIds }
            : {}),
        },
      }],
    },
  };
}

function legacyDocument(content, revisionId = "opaque-revision") {
  return {
    documentId: FILE.id,
    revisionId,
    body: { content },
  };
}

function tabbedDocument(
  content,
  {
    revisionId = "opaque-revision",
    tabId = "synthetic-tab",
  } = {},
) {
  return {
    documentId: FILE.id,
    revisionId,
    tabs: [{
      tabProperties: { tabId },
      documentTab: { body: { content } },
    }],
  };
}

function evidenceTimes() {
  return {
    occurredAt: FILE.createdTime,
    observedAt: OBSERVED_AT,
  };
}

describe("GDocs Task Map producer seam", () => {
  it("requires an explicit canonical owner matching confirmed resident config", () => {
    const confirmed = {
      user_id: "14802294-BEED-480E-ABF6-7E3703FA25CD",
      device_credential:
        "dbd_gdocs_confirmed_123456789012345678901234",
      device_credential_confirmed: true,
    };
    assert.equal(confirmedTaskMapProducerUserId({
      config: confirmed,
      explicitUserId: confirmed.user_id,
      requestedUserId: confirmed.user_id,
    }), confirmed.user_id);
    for (const input of [
      { config: confirmed, explicitUserId: undefined },
      { config: confirmed, explicitUserId: "not-canonical" },
      {
        config: { ...confirmed, device_credential_confirmed: false },
        explicitUserId: confirmed.user_id,
      },
      {
        config: confirmed,
        explicitUserId: "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1",
      },
      {
        config: confirmed,
        explicitUserId: confirmed.user_id,
        requestedUserId: "B8A25F07-C6ED-4E32-AC8A-6B13A43A62D1",
      },
    ]) {
      assert.throws(
        () => confirmedTaskMapProducerUserId(input),
        /identity|owner/i,
      );
    }
  });

  it("serializes producer-mode missing-token failures without private paths or error text", async () => {
    const root = mkdtempSync(join(
      tmpdir(),
      "gdocs-private-token-path-sentinel-",
    ));
    try {
      const tokenPath = join(root, "owner-private-token.json");
      let missingTokenError;
      try {
        await getToken({
          login: false,
          nonInteractive: true,
          tokenFile: tokenPath,
        });
        assert.fail("missing token must fail");
      } catch (error) {
        missingTokenError = error;
      }
      assert.ok(missingTokenError.message.includes(tokenPath));
      const producerMode = gdocsArgvRequestsTaskMapProducer([
        "--export-taskmap-producer",
        "/tmp/producer.json",
      ]);
      assert.strictEqual(producerMode, true);
      const serialized = serializeGdocsTopLevelFailure(
        missingTokenError,
        { producerMode },
      );
      const payload = JSON.parse(serialized);
      assert.deepStrictEqual(Object.keys(payload).sort(), [
        "error_kind",
        "failure_digest",
      ]);
      assert.strictEqual(
        payload.error_kind,
        "authentication_unavailable",
      );
      assert.match(payload.failure_digest, /^[a-f0-9]{64}$/);
      assert.ok(!serialized.includes(tokenPath));
      assert.ok(!serialized.includes(missingTokenError.message));
      assert.ok(!serialized.includes("No Google Docs token"));

      const legacy = serializeGdocsTopLevelFailure(
        missingTokenError,
        { producerMode: false },
      );
      assert.ok(legacy.includes(tokenPath));
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("requires explicit read-only Calendar scope without breaking older Docs-only tokens", () => {
    const docsOnly = {
      access_token: "synthetic-access",
      scope: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/documents.readonly",
      ].join(" "),
    };
    assert.strictEqual(
      tokenHasGoogleCalendarReadScope(docsOnly),
      false,
    );
    assert.throws(
      () => assertGoogleCalendarReadScope(docsOnly),
      (error) =>
        error.code === "GOOGLE_CALENDAR_REAUTH_REQUIRED"
        && /reconnect Google Workspace/.test(error.message),
    );
    const calendarToken = {
      ...docsOnly,
      daobrew_authorized_scopes: [GOOGLE_CALENDAR_READONLY_SCOPE],
    };
    assert.strictEqual(
      tokenHasGoogleCalendarReadScope(calendarToken),
      true,
    );
    assert.doesNotThrow(
      () => assertGoogleCalendarReadScope(calendarToken),
    );
    const serialized = serializeGdocsTopLevelFailure(
      Object.assign(new Error("private OAuth detail"), {
        code: "GOOGLE_CALENDAR_REAUTH_REQUIRED",
      }),
      { producerMode: true },
    );
    const payload = JSON.parse(serialized);
    assert.strictEqual(
      payload.error_kind,
      "calendar_reauthorization_required",
    );
    assert.ok(!serialized.includes("private OAuth detail"));
  });

  it("accepts a Calendar-only producer command without a Drive folder", () => {
    const options = parseArgs([
      "--export-calendar-producer",
      "/tmp/synthetic-google-calendar.json",
      "--google-calendar-id",
      "primary",
      "--user-id",
      "synthetic-owner",
      "--taskmap-observed-at",
      OBSERVED_AT,
      "--calendar-past-days",
      "7",
      "--calendar-future-days",
      "30",
      "--non-interactive",
    ]);
    assert.strictEqual(
      options.exportCalendarProducer,
      "/tmp/synthetic-google-calendar.json",
    );
    assert.strictEqual(options.googleCalendarId, "primary");
    assert.strictEqual(options.calendarPastDays, 7);
    assert.strictEqual(options.calendarFutureDays, 30);
    const defaults = parseArgs([
      "--export-calendar-producer",
      "/tmp/synthetic-google-calendar-defaults.json",
      "--google-calendar-id",
      "primary",
      "--user-id",
      "synthetic-owner",
      "--non-interactive",
    ]);
    assert.strictEqual(defaults.calendarPastDays, 14);
    assert.strictEqual(defaults.calendarFutureDays, 30);
    assert.strictEqual(
      gdocsArgvRequestsTaskMapProducer([
        "--export-calendar-producer=/tmp/calendar.json",
      ]),
      true,
    );
    assert.throws(
      () => parseArgs([
        "--granola-variant-snapshot",
        "/tmp/legacy-granola.json",
      ]),
      /Unknown argument/,
    );
  });

  it("fails closed on a non-canonical Postgres import owner", () => {
    assert.throws(
      () => parseArgs([
        "--export-snapshot",
        "/tmp/synthetic-gdocs.json",
        "--folder-id",
        "synthetic-folder",
        "--import-postgres",
        "--user-id",
        "not-a-uuid",
        "--non-interactive",
      ]),
      /import-postgres requires a canonical UUID user id/,
    );
  });

  it("builds bounded privacy-safe Google Calendar rows and omits unsafe events", () => {
    const rows = buildTaskMapGoogleCalendarEventRows([
      {
        id: "provider-id-1",
        iCalUID: "shared-ical-1",
        summary: "Review the launch checklist",
        status: "confirmed",
        updated: "2026-07-30T11:30:00.000Z",
        start: { dateTime: "2026-07-30T13:00:00-07:00" },
        end: { dateTime: "2026-07-30T13:30:00-07:00" },
        description: "private body must never be retained",
        attendees: [{ email: "private@example.com" }],
        location: "private place",
      },
      {
        id: "provider-id-private",
        summary: "Email private@example.com",
        status: "confirmed",
        start: { date: "2026-07-31" },
        end: { date: "2026-08-01" },
      },
      {
        id: "provider-id-cancelled",
        summary: "Cancelled event",
        status: "cancelled",
        start: { date: "2026-07-31" },
        end: { date: "2026-08-01" },
      },
    ], "primary");
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(Object.keys(rows[0]).sort(), [
      "crossProviderIdentityDigest",
      "endAt",
      "eventIdentityDigest",
      "revisionDigest",
      "startAt",
      "title",
    ]);
    assert.strictEqual(rows[0].title, "Review the launch checklist");
    assert.strictEqual(rows[0].startAt, "2026-07-30T20:00:00.000Z");
    assert.strictEqual(rows[0].endAt, "2026-07-30T20:30:00.000Z");
    assert.match(rows[0].eventIdentityDigest, /^[a-f0-9]{64}$/);
    assert.match(rows[0].crossProviderIdentityDigest, /^[a-f0-9]{64}$/);
    assert.match(rows[0].revisionDigest, /^[a-f0-9]{64}$/);
    assert.strictEqual(
      rows[0].eventIdentityDigest,
      "8bfc5a853ef0d5512b0e363e9dd1feeaa0a2f7cee1dcde14d8c34fb09c429a13",
    );
    assert.strictEqual(
      rows[0].crossProviderIdentityDigest,
      "74f3e063bb81394c35cfbce313657661ea7f13be84823d2ac88749309eacc6fc",
    );
    assert.strictEqual(
      rows[0].revisionDigest,
      "2e5d6347085b3add80b4778d94e9d4d26e66699b18bef4482e66fee53760a3f2",
    );
    const serialized = JSON.stringify(rows);
    assert.ok(!serialized.includes("provider-id"));
    assert.ok(!serialized.includes("private@example.com"));
    assert.ok(!serialized.includes("private place"));
    assert.ok(!serialized.includes("private body"));
  });

  it("bounds Calendar events.list by time, result count, and page count", async () => {
    const token = {
      access_token: "synthetic-access",
      scope: GOOGLE_CALENDAR_READONLY_SCOPE,
    };
    const urls = [];
    let calls = 0;
    const result = await listGoogleCalendarEvents({
      googleCalendarId: "primary",
      taskMapObservedAt: OBSERVED_AT,
      calendarPastDays: 7,
      calendarFutureDays: 30,
    }, token, async (_options, _token, url) => {
      urls.push(new URL(url));
      calls += 1;
      return calls === 1
        ? {
            items: [{
              id: "event-1",
              iCalUID: "ical-1",
              summary: "First bounded event",
              status: "confirmed",
              start: { dateTime: "2026-07-29T13:00:00.000Z" },
              end: { dateTime: "2026-07-29T13:30:00.000Z" },
            }],
            nextPageToken: "page-2",
          }
        : {
            items: [{
              id: "event-2",
              summary: "Second bounded event",
              status: "confirmed",
              start: { dateTime: "2026-07-30T13:00:00.000Z" },
              end: { dateTime: "2026-07-30T13:30:00.000Z" },
            }],
          };
    });
    assert.strictEqual(result.pages, 2);
    assert.strictEqual(result.rows.length, 2);
    assert.strictEqual(
      urls[0].searchParams.get("timeMin"),
      "2026-07-22T20:00:00.000Z",
    );
    assert.strictEqual(
      urls[0].searchParams.get("timeMax"),
      "2026-08-28T20:00:00.000Z",
    );
    assert.strictEqual(urls[0].searchParams.get("singleEvents"), "true");
    assert.strictEqual(urls[0].searchParams.get("orderBy"), "startTime");
    assert.strictEqual(urls[1].searchParams.get("pageToken"), "page-2");

    await assert.rejects(
      listGoogleCalendarEvents({
        googleCalendarId: "primary",
        taskMapObservedAt: OBSERVED_AT,
        calendarPastDays: 7,
        calendarFutureDays: 30,
      }, token, async () => ({
        items: Array.from(
          { length: TASKMAP_GOOGLE_CALENDAR_MAX_EVENTS + 1 },
          (_, index) => ({
            id: `event-${index}`,
            summary: `Bounded event ${index}`,
            status: "confirmed",
            start: { dateTime: "2026-07-30T13:00:00.000Z" },
            end: { dateTime: "2026-07-30T13:30:00.000Z" },
          }),
        ),
      })),
      /event window is incomplete/,
    );
  });

  it("writes a digest-only Calendar producer response through the injected builder", async () => {
    const rawCalendarId = "private-calendar-id-sentinel";
    const writes = [];
    const logs = [];
    const originalLog = console.log;
    console.log = (value) => logs.push(String(value));
    try {
      const result = await exportGoogleCalendarProducer({
        exportCalendarProducer: "/tmp/synthetic-calendar-provider.json",
        googleCalendarId: rawCalendarId,
        userId: "synthetic-owner",
        taskMapObservedAt: OBSERVED_AT,
        calendarPastDays: 7,
        calendarFutureDays: 30,
      }, {
        access_token: "synthetic-access",
        scope: GOOGLE_CALENDAR_READONLY_SCOPE,
      }, {
        get: async () => ({
          items: [{
            id: "event-1",
            summary: "Prepare the demo outline",
            status: "confirmed",
            start: { dateTime: "2026-07-30T13:00:00.000Z" },
            end: { dateTime: "2026-07-30T13:30:00.000Z" },
          }],
        }),
        loadCalendarModule: () => ({
          taskMapCalendarOwnerScopeDigest: () => "a".repeat(64),
          buildTaskMapGoogleCalendarProviderSnapshot: (input) => ({
            contractVersion:
              "taskmap-google-calendar-provider-snapshot.v1",
            snapshotDigest: "b".repeat(64),
            producerVersion: "taskmap-google-calendar-api.1",
            ownerScopeDigest: input.ownerScopeDigest,
            producedAt: input.producedAt,
            validThrough: "2026-07-30T24:00:00.000Z",
            events: input.events,
            privacy: {},
          }),
        }),
        writeSnapshot: (target, snapshot) => {
          writes.push({ target, snapshot });
        },
      });
      assert.strictEqual(writes.length, 1);
      assert.strictEqual(result.response.provider, "google_calendar");
      assert.match(
        result.response.calendar_identity_digest,
        /^[a-f0-9]{64}$/,
      );
      const serialized = JSON.stringify({ result, logs });
      assert.ok(!serialized.includes(rawCalendarId));
      assert.ok(!serialized.includes("event-1"));
    } finally {
      console.log = originalLog;
    }
  });

  it("prints a digest-only folder identity for Task Map exports while preserving exported status", () => {
    const rawFolderId = "raw-private-folder-id-sentinel";
    const response = buildGdocsExportResponse({
      days: 30,
      folderId: rawFolderId,
      exportTaskMapProducer: "/tmp/taskmap-producer.json",
    }, 4);
    const printed = JSON.stringify(response, null, 2);
    assert.ok(!printed.includes(rawFolderId));
    assert.ok(!Object.hasOwn(response, "folder_id"));
    assert.match(response.folder_digest, /^[a-f0-9]{64}$/);
    assert.strictEqual(JSON.parse(printed).status, "exported");
    assert.strictEqual(JSON.parse(printed).meeting_notes, 4);

    const legacy = buildGdocsExportResponse({
      days: 30,
      folderId: rawFolderId,
      exportTaskMapProducer: null,
    }, 4);
    assert.strictEqual(legacy.folder_id, rawFolderId);
    assert.ok(!Object.hasOwn(legacy, "folder_digest"));
  });

  it("bounds every provider JSON response by content length and streamed bytes", async () => {
    assert.strictEqual(GDOCS_PROVIDER_RESPONSE_MAX_BYTES, 2 * 1024 * 1024);
    const valid = await readBoundedProviderJson(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      "synthetic provider",
    );
    assert.deepStrictEqual(valid, { ok: true });

    await assert.rejects(
      readBoundedProviderJson(
        new Response("{}", {
          status: 200,
          headers: {
            "content-length": String(
              GDOCS_PROVIDER_RESPONSE_MAX_BYTES + 1,
            ),
          },
        }),
        "synthetic provider",
      ),
      { name: "ProviderResponseTooLargeError" },
    );

    const oversizedStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new Uint8Array(GDOCS_PROVIDER_RESPONSE_MAX_BYTES),
        );
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    await assert.rejects(
      readBoundedProviderJson(
        new Response(oversizedStream, { status: 200 }),
        "synthetic provider",
      ),
      { name: "ProviderResponseTooLargeError" },
    );
  });

  it("reports per-document read failures with only a coarse kind and domain-separated digest", () => {
    const rawDocumentId = "private-doc-id-do-not-log";
    const rawErrorText =
      "GET https://docs.google.com/document/d/private-doc-id-do-not-log " +
      "failed with private response body";
    const lines = [];
    const failureDigest = reportGdocsDocumentReadFailure(
      rawDocumentId,
      new Error(rawErrorText),
      (line) => lines.push(String(line)),
    );
    assert.strictEqual(lines.length, 1);
    const reported = JSON.parse(lines[0]);
    assert.deepStrictEqual(reported, {
      warning: "gdocs_document_read_failed",
      error_kind: "read_failed",
      failure_digest: failureDigest,
    });
    assert.match(failureDigest, /^[a-f0-9]{64}$/);
    for (const forbidden of [
      rawDocumentId,
      rawErrorText,
      "https://docs.google.com",
      "private response body",
    ]) {
      assert.ok(!lines[0].includes(forbidden), forbidden);
    }
  });

  it("falls back to valid GDocs primaries when optional Granola variants exceed limits or are future-dated", () => {
    const primary = {
      documentId: "synthetic-primary",
      revisionId: "revision-1",
      secondaryVariants: [],
    };
    const buildSnapshot = (input) => {
      for (const meeting of input.meetings) {
        if (!meeting.revisionId) {
          throw new Error("invalid primary revision");
        }
        if (meeting.secondaryVariants.length > 7) {
          throw new Error("too many optional variants");
        }
        if (meeting.secondaryVariants.some(
          (variant) =>
            Date.parse(variant.eventTime) > Date.parse(input.producedAt),
        )) {
          throw new Error("future optional variant");
        }
      }
      return {
        secondaryCount: input.meetings.reduce(
          (count, meeting) => count + meeting.secondaryVariants.length,
          0,
        ),
      };
    };
    const cases = [
      Array.from({ length: 8 }, () => ({
        eventTime: "2026-07-29T19:00:00.000Z",
      })),
      [{ eventTime: "2026-07-29T21:00:00.000Z" }],
    ];
    for (const secondaryVariants of cases) {
      const fallbacks = [];
      const snapshot = buildTaskMapSnapshotWithOptionalGranola(
        buildSnapshot,
        {
          producedAt: OBSERVED_AT,
          meetings: [{ ...primary, secondaryVariants }],
        },
        {
          onFallback(value) {
            fallbacks.push(value);
          },
        },
      );
      assert.deepStrictEqual(snapshot, { secondaryCount: 0 });
      assert.strictEqual(fallbacks.length, 1);
      assert.match(fallbacks[0].failureDigest, /^[a-f0-9]{64}$/);
    }

    assert.throws(
      () => buildTaskMapSnapshotWithOptionalGranola(
        buildSnapshot,
        {
          producedAt: OBSERVED_AT,
          meetings: [{
            ...primary,
            revisionId: "",
            secondaryVariants: [{
              eventTime: "2026-07-29T21:00:00.000Z",
            }],
          }],
        },
      ),
      /invalid primary revision/,
    );
  });

  it("extracts only explicit bounded meeting evidence and stores URL digests", () => {
    const privateBody = [
      "Unlabelled private prose must not become evidence.",
      "Decision: [Alice] Keep the producer envelope metadata-only.",
      "- [ ] Action item: [Bob] Wire https://github.com/dao/repo/issues/42 (due: 2026-08-01)",
      "- [x] Commitment: [Carol] Verify the owner-safe rollout.",
      "Participants: Private Person",
      "Transcript: private transcript text",
    ].join("\n");
    const evidence = extractTaskMapMeetingEvidence(privateBody, {
      occurredAt: FILE.createdTime,
      observedAt: OBSERVED_AT,
    });

    assert.strictEqual(evidence.length, 3);
    assert.deepStrictEqual(
      evidence.map((row) => row.kind),
      ["decision", "action_item", "commitment"],
    );
    assert.strictEqual(evidence[1].status, "open");
    assert.strictEqual(evidence[2].status, "done");
    assert.strictEqual(evidence[1].deadline, "2026-08-01T23:59:59.000Z");
    assert.strictEqual(evidence[1].objectRefs.length, 1);
    assert.match(evidence[1].objectRefs[0].referenceDigest, /^[a-f0-9]{64}$/);
    assert.ok(evidence.every((row) => [...row.title].length <= 96));
    assert.ok(evidence.every((row) => [...row.summary].length <= 200));
    const serialized = JSON.stringify(evidence);
    assert.ok(!serialized.includes("Unlabelled private prose"));
    assert.ok(!serialized.includes("Alice"));
    assert.ok(!serialized.includes("Bob"));
    assert.ok(!serialized.includes("Carol"));
    assert.ok(!serialized.includes("Private Person"));
    assert.ok(!serialized.includes("private transcript"));
    assert.ok(!serialized.includes("https://github.com"));
  });

  it("extracts only section-scoped list rows from the exact one-tab meeting shape", () => {
    const detailLengths = [343, 367, 391, 415, 439, 463, 519, 567];
    const content = [
      paragraph("TITLE", "Synthetic design sync"),
      paragraph("HEADING_3", "Summary"),
      paragraph("NORMAL_TEXT", "s".repeat(797)),
      paragraph("HEADING_3", "Decisions"),
      paragraph("SUBTITLE", "Aligned"),
      paragraph(
        "NORMAL_TEXT",
        "[Alice] Keep revision and structural content bound together.",
        { bullet: true },
      ),
      paragraph("NORMAL_TEXT", "Unbulleted feedback line one."),
      paragraph("NORMAL_TEXT", "Unbulleted feedback line two."),
      paragraph("HEADING_3", "Next steps"),
      paragraph(
        "NORMAL_TEXT",
        "[The group] Ship the owner-safe loader.",
        { isListItem: true },
      ),
      paragraph("HEADING_3", "Details"),
      ...detailLengths.map((length) => (
        paragraph("NORMAL_TEXT", "d".repeat(length), { bullet: true })
      )),
      ...Array.from({ length: 17 }, () => paragraph("NORMAL_TEXT", "")),
    ];
    assert.strictEqual(content.length, 36);
    const evidence = extractTaskMapMeetingEvidenceFromGoogleDoc(
      tabbedDocument(content),
      evidenceTimes(),
    );

    assert.deepStrictEqual(
      evidence.map((row) => row.kind),
      ["decision", "action_item"],
    );
    assert.deepStrictEqual(
      evidence.map((row) => row.summary),
      [
        "Keep revision and structural content bound together.",
        "Ship the owner-safe loader.",
      ],
    );
    const serialized = JSON.stringify(evidence);
    assert.ok(!serialized.includes("Alice"));
    assert.ok(!serialized.includes("The group"));
    assert.ok(!serialized.includes("s".repeat(100)));
    assert.ok(!serialized.includes("d".repeat(100)));
  });

  it("uses exact English and Chinese headings and resets Summary/Details", () => {
    const decisionHeadings = ["Decisions", "决策", "决定"];
    const actionHeadings = [
      "Next steps",
      "下一步",
      "后续步骤",
      "行动项",
      "待办事项",
    ];
    for (const heading of decisionHeadings) {
      const evidence = extractTaskMapMeetingEvidenceFromGoogleDoc(
        legacyDocument([
          paragraph("HEADING_3", heading),
          paragraph("NORMAL_TEXT", "[Private Person] Keep the decision.", {
            isListItem: true,
          }),
        ]),
        evidenceTimes(),
      );
      assert.strictEqual(evidence.length, 1, heading);
      assert.strictEqual(evidence[0].kind, "decision", heading);
      assert.strictEqual(evidence[0].summary, "Keep the decision.", heading);
    }
    for (const heading of actionHeadings) {
      const evidence = extractTaskMapMeetingEvidenceFromGoogleDoc(
        legacyDocument([
          paragraph("HEADING_3", heading),
          paragraph("NORMAL_TEXT", "[Private Person] Ship the action.", {
            bullet: true,
          }),
        ]),
        evidenceTimes(),
      );
      assert.strictEqual(evidence.length, 1, heading);
      assert.strictEqual(evidence[0].kind, "action_item", heading);
      assert.strictEqual(evidence[0].summary, "Ship the action.", heading);
    }

    const ignored = extractTaskMapMeetingEvidenceFromGoogleDoc(
      legacyDocument([
        paragraph("HEADING_3", "Summary"),
        paragraph("NORMAL_TEXT", "Action item: must stay out.", {
          isListItem: true,
        }),
        paragraph("HEADING_3", "Next steps"),
        paragraph("NORMAL_TEXT", "[Owner] Keep this row.", {
          isListItem: true,
        }),
        paragraph("HEADING_3", "Details"),
        paragraph("NORMAL_TEXT", "Decision: short leak sentinel.", {
          isListItem: true,
        }),
        paragraph("HEADING_3", "Suggested next steps"),
        paragraph("NORMAL_TEXT", "Do not broaden the allowlist.", {
          isListItem: true,
        }),
      ]),
      evidenceTimes(),
    );
    assert.deepStrictEqual(
      ignored.map((row) => row.summary),
      ["Keep this row."],
    );
  });

  it("drops privacy-unsafe explicit rows without suppressing valid evidence", () => {
    const evidence = extractTaskMapMeetingEvidenceFromGoogleDoc(
      legacyDocument([
        paragraph("HEADING_3", "Next steps"),
        paragraph(
          "NORMAL_TEXT",
          "[Alice] Email alice@example.com the token.",
          { bullet: true },
        ),
        paragraph(
          "NORMAL_TEXT",
          "Action item: [Alice] Review (/etc/passwd).",
          { bullet: true },
        ),
        paragraph(
          "NORMAL_TEXT",
          "Action item: [Alice] Open \"/Users/neo/private.json\".",
          { bullet: true },
        ),
        paragraph(
          "NORMAL_TEXT",
          String.raw`Action item: [Alice] Open \\server\share\secret.`,
          { bullet: true },
        ),
        paragraph(
          "NORMAL_TEXT",
          "[ ] [Bob] Ship the privacy-safe release.",
          { bullet: true },
        ),
        paragraph(
          "NORMAL_TEXT",
          "Action item: [Carol] Verify the labelled release.",
          { bullet: true },
        ),
      ]),
      evidenceTimes(),
    );
    assert.deepStrictEqual(
      evidence.map((row) => row.summary),
      [
        "Ship the privacy-safe release.",
        "Verify the labelled release.",
      ],
    );
    assert.strictEqual(evidence[0].status, "open");
    assert.ok(!JSON.stringify(evidence).includes("alice@example.com"));
    assert.ok(!JSON.stringify(evidence).includes("/etc/passwd"));
    assert.ok(!JSON.stringify(evidence).includes("/Users/neo"));
    assert.ok(!JSON.stringify(evidence).includes("server"));
    assert.ok(!JSON.stringify(evidence).includes("Alice"));
    assert.ok(!JSON.stringify(evidence).includes("Bob"));
    assert.ok(!JSON.stringify(evidence).includes("Carol"));
  });

  it("keeps exact Docs revision identity while content identity stays stable", () => {
    const text = "Decision: Freeze the revision-bound producer contract.";
    const body = [
      paragraph("HEADING_3", "Decisions"),
      paragraph(
        "NORMAL_TEXT",
        "[Private Person] Freeze the revision-bound producer contract.",
        { isListItem: true },
      ),
    ];
    const first = buildTaskMapGdocsMeetingDraft({
      file: FILE,
      document: legacyDocument(body, "opaque-docs-revision-a"),
      extractedText: text,
      observedAt: OBSERVED_AT,
    });
    const rotated = buildTaskMapGdocsMeetingDraft({
      file: FILE,
      document: legacyDocument(body, "opaque-docs-revision-b"),
      extractedText: text,
      observedAt: OBSERVED_AT,
    });

    assert.strictEqual(first.revisionId, "opaque-docs-revision-a");
    assert.strictEqual(rotated.revisionId, "opaque-docs-revision-b");
    assert.strictEqual(first.contentDigest, rotated.contentDigest);
    assert.deepStrictEqual(first.evidence, rotated.evidence);
    assert.strictEqual(first.evidence.length, 1);
  });

  it("binds content identity to structural style/list changes", () => {
    const plain = legacyDocument([
      paragraph("NORMAL_TEXT", "Next steps"),
      paragraph("NORMAL_TEXT", "Ship the bounded producer."),
    ]);
    const structured = legacyDocument([
      paragraph("HEADING_3", "Next steps"),
      paragraph(
        "NORMAL_TEXT",
        "Ship the bounded producer.",
        { isListItem: true },
      ),
    ]);
    const extractedText = "Next steps\nShip the bounded producer.";
    const plainDraft = buildTaskMapGdocsMeetingDraft({
      file: FILE,
      document: plain,
      extractedText,
      observedAt: OBSERVED_AT,
    });
    const structuredDraft = buildTaskMapGdocsMeetingDraft({
      file: FILE,
      document: structured,
      extractedText,
      observedAt: OBSERVED_AT,
    });
    assert.deepStrictEqual(plainDraft.evidence, []);
    assert.strictEqual(structuredDraft.evidence.length, 1);
    assert.notStrictEqual(
      plainDraft.contentDigest,
      structuredDraft.contentDigest,
    );
  });

  it("requests complete suggestion-free tab content and fails closed on ambiguous shapes", () => {
    const requestUrl = new URL(docsGetUrl(FILE.id, true));
    assert.strictEqual(
      requestUrl.searchParams.get("includeTabsContent"),
      "true",
    );
    assert.strictEqual(
      requestUrl.searchParams.get("suggestionsViewMode"),
      "PREVIEW_WITHOUT_SUGGESTIONS",
    );

    const oneTab = tabbedDocument([
      paragraph("HEADING_3", "Next steps"),
      paragraph("NORMAL_TEXT", "[Owner] Ship the one-tab result.", {
        bullet: true,
      }),
    ]);
    assert.strictEqual(
      extractTaskMapMeetingEvidenceFromGoogleDoc(
        oneTab,
        evidenceTimes(),
      ).length,
      1,
    );

    const multiTabWithLegacyFallback = {
      ...oneTab,
      body: oneTab.tabs[0].documentTab.body,
      tabs: [
        ...oneTab.tabs,
        {
          tabProperties: { tabId: "hidden-second-tab" },
          documentTab: { body: { content: [] } },
        },
      ],
    };
    assert.throws(
      () => extractTaskMapMeetingEvidenceFromGoogleDoc(
        multiTabWithLegacyFallback,
        evidenceTimes(),
      ),
      /exactly one document tab/,
    );

    const suggested = legacyDocument([
      paragraph("HEADING_3", "Next steps"),
      paragraph(
        "NORMAL_TEXT",
        "Unaccepted suggested action.",
        {
          bullet: true,
          suggestedInsertionIds: ["suggestion-1"],
        },
      ),
    ]);
    assert.throws(
      () => extractTaskMapMeetingEvidenceFromGoogleDoc(
        suggested,
        evidenceTimes(),
      ),
      /unresolved suggested content/,
    );
  });

  it("digests text links and rich-link smart chips without storing URLs", () => {
    const document = legacyDocument([
      paragraph("HEADING_3", "Next steps"),
      paragraph(
        "NORMAL_TEXT",
        "",
        {
          bullet: true,
          elements: [
            {
              textRun: {
                content: "[Owner] Ship the linked work item",
                textStyle: {
                  link: { url: "http://private.example/work/42?b=2&a=1" },
                },
              },
            },
            {
              richLink: {
                richLinkProperties: {
                  uri: "https://example.com/smart-chip/84",
                },
              },
            },
          ],
        },
      ),
    ]);
    const [evidence] = extractTaskMapMeetingEvidenceFromGoogleDoc(
      document,
      evidenceTimes(),
    );
    assert.strictEqual(evidence.summary, "Ship the linked work item");
    assert.strictEqual(evidence.objectRefs.length, 2);
    assert.ok(evidence.objectRefs.every(
      (ref) => /^[a-f0-9]{64}$/.test(ref.referenceDigest),
    ));
    const serialized = JSON.stringify(evidence);
    assert.ok(!serialized.includes("example.com"));
    assert.ok(!serialized.includes("Owner"));
  });

  it("fails closed when documents.get omits revisionId", () => {
    assert.throws(
      () => buildTaskMapGdocsMeetingDraft({
        file: FILE,
        document: { documentId: FILE.id },
        extractedText: "Decision: This row must never publish.",
        observedAt: OBSERVED_AT,
      }),
      /missing revisionId/,
    );
  });

  it("keeps ordinary discussion prose out", () => {
    const evidence = extractTaskMapMeetingEvidence([
      "We discussed an action item and might decide later.",
      "The next step could be to revisit this.",
    ].join("\n"), {
      occurredAt: FILE.createdTime,
      observedAt: OBSERVED_AT,
    });
    assert.deepStrictEqual(evidence, []);
  });

  it("keeps mechanically explicit unlinked actions for statement-keying", () => {
    const evidence = extractTaskMapMeetingEvidence(
      "Action item: Send the approved launch brief.",
      {
        occurredAt: FILE.createdTime,
        observedAt: OBSERVED_AT,
      },
    );
    assert.strictEqual(evidence.length, 1);
    assert.strictEqual(evidence[0].kind, "action_item");
    assert.deepStrictEqual(evidence[0].objectRefs, []);
  });

  it("accepts the 200-character summary boundary and rejects 201", () => {
    const atBoundary = extractTaskMapMeetingEvidence(
      `Decision: ${"x".repeat(200)}`,
      {
        occurredAt: FILE.createdTime,
        observedAt: OBSERVED_AT,
      },
    );
    const overBoundary = extractTaskMapMeetingEvidence(
      `Decision: ${"x".repeat(201)}`,
      {
        occurredAt: FILE.createdTime,
        observedAt: OBSERVED_AT,
      },
    );
    assert.strictEqual(atBoundary.length, 1);
    assert.strictEqual([...atBoundary[0].summary].length, 200);
    assert.deepStrictEqual(overBoundary, []);
  });

  it("keeps explicit HTTP(S) URLs as distinct digest-only identities", () => {
    const first = extractTaskMapMeetingEvidence(
      "Action item: Review http://private.example/work/one",
      evidenceTimes(),
    );
    const second = extractTaskMapMeetingEvidence(
      "Action item: Review https://example.com/work/two",
      evidenceTimes(),
    );
    assert.strictEqual(first.length, 1);
    assert.strictEqual(second.length, 1);
    assert.strictEqual(first[0].summary, second[0].summary);
    assert.notStrictEqual(
      first[0].objectRefs[0].referenceDigest,
      second[0].objectRefs[0].referenceDigest,
    );
    assert.ok(!JSON.stringify(first).includes("example.com"));
    assert.ok(!JSON.stringify(second).includes("example.com"));
    assert.deepStrictEqual(
      extractTaskMapMeetingEvidence(
        "Action item: Read file:///etc/passwd",
        evidenceTimes(),
      ),
      [],
    );
  });

  it("normalizes explicit URL evidence identically across GDocs and Granola", () => {
    const statement = "Ship the shared release " +
      "https://example.com/work/shared";
    const [gdocs] = extractTaskMapMeetingEvidenceFromGoogleDoc(
      legacyDocument([
        paragraph("HEADING_3", "Next steps"),
        paragraph("NORMAL_TEXT", statement, { bullet: true }),
      ]),
      evidenceTimes(),
    );
    const [granola] = extractTaskMapMeetingEvidence(
      `Action item: ${statement}`,
      evidenceTimes(),
    );
    assert.deepStrictEqual(
      {
        kind: gdocs.kind,
        title: gdocs.title,
        summary: gdocs.summary,
        objectRefs: gdocs.objectRefs,
      },
      {
        kind: granola.kind,
        title: granola.title,
        summary: granola.summary,
        objectRefs: granola.objectRefs,
      },
    );
  });

  it("round-trip validates explicit due dates and preserves commitment status", () => {
    const leap = extractTaskMapMeetingEvidence(
      "- [x] Commitment: Ship safely (due: 2028-02-29)",
      evidenceTimes(),
    );
    const nonLeap = extractTaskMapMeetingEvidence(
      "Action item: Ship safely (due: 2026-02-29)",
      evidenceTimes(),
    );
    const overflow = extractTaskMapMeetingEvidence(
      "Action item: Ship safely (due: 2026-04-31)",
      evidenceTimes(),
    );
    assert.strictEqual(leap.length, 1);
    assert.strictEqual(leap[0].kind, "commitment");
    assert.strictEqual(leap[0].status, "done");
    assert.strictEqual(leap[0].deadline, "2028-02-29T23:59:59.000Z");
    assert.deepStrictEqual(nonLeap, []);
    assert.deepStrictEqual(overflow, []);
  });

  it("treats producer-only export as an active snapshot command", () => {
    const options = parseArgs([
      "--export-taskmap-producer",
      "/tmp/synthetic-taskmap-producer.json",
      "--folder-id",
      "synthetic-folder",
      "--user-id",
      "synthetic-owner",
      "--taskmap-observed-at",
      OBSERVED_AT,
      "--non-interactive",
    ]);
    assert.strictEqual(options.exportSnapshot, null);
    assert.strictEqual(
      options.exportTaskMapProducer,
      "/tmp/synthetic-taskmap-producer.json",
    );
    assert.strictEqual(options.folderId, "synthetic-folder");
    assert.strictEqual(shouldExportGdocsSnapshot(options), true);
    assert.strictEqual(
      shouldExportGdocsSnapshot({
        exportSnapshot: null,
        exportTaskMapProducer: null,
      }),
      false,
    );
  });

  it("bounds Drive traversal at max+1 and derives the window from one observation", async () => {
    const sourceObservedAt = "2026-07-29T20:00:00.000Z";
    const options = {
      days: 30,
      folderId: "synthetic-folder",
      exportTaskMapProducer: "/tmp/synthetic-producer.json",
      sourceObservedAt,
    };
    let capturedUrl;
    const files = Array.from({ length: 64 }, (_, index) => ({
      id: `doc-${index}`,
    }));
    const returned = await listFolderDocs(
      options,
      "synthetic-token",
      async (_options, _token, url) => {
        capturedUrl = url;
        return { files };
      },
    );
    assert.strictEqual(returned.length, 64);
    const queryUrl = new URL(capturedUrl);
    assert.strictEqual(queryUrl.searchParams.get("pageSize"), "65");
    assert.match(
      queryUrl.searchParams.get("q"),
      /modifiedTime > '2026-06-29T20:00:00.000Z'/,
    );

    let calls = 0;
    await assert.rejects(
      listFolderDocs(
        options,
        "synthetic-token",
        async () => {
          calls += 1;
          return { files, nextPageToken: "unread-page" };
        },
      ),
      /document page is incomplete/,
    );
    assert.strictEqual(calls, 1);

    await assert.rejects(
      listFolderDocs(
        options,
        "synthetic-token",
        async () => ({
          files: [...files, { id: "doc-64" }],
        }),
      ),
      /document page is incomplete/,
    );
  });

  it("writes compact 0600 bytes without mutating caller directory permissions", () => {
    const root = mkdtempSync(join(tmpdir(), "gdocs-taskmap-writer-"));
    try {
      const target = join(root, "producer.json");
      const snapshot = {
        zPayload: "x".repeat(240_000),
        aContract: "canonical-first",
      };
      writeOwnerOnlyTaskMapSnapshot(target, snapshot);
      const bytes = readFileSync(target, "utf8");
      assert.strictEqual(bytes, taskMapCanonicalJson(snapshot));
      assert.strictEqual(statSync(target).mode & 0o777, 0o600);
      assert.strictEqual(statSync(root).mode & 0o777, 0o700);
      assert.throws(
        () => writeOwnerOnlyTaskMapSnapshot("relative.json", snapshot),
        /normalized and absolute/,
      );

      const unsafe = join(root, "unsafe");
      writeFileSync(unsafe, "not-a-directory");
      assert.throws(
        () => writeOwnerOnlyTaskMapSnapshot(
          join(unsafe, "producer.json"),
          snapshot,
        ),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("authenticates Granola and quarantines ambiguous or malformed variants", () => {
    const root = mkdtempSync(join(tmpdir(), "gdocs-taskmap-granola-"));
    try {
      const snapshotPath = join(root, "granola.json");
      const note = {
        id: "granola-note",
        created_at: "2026-07-29T16:00:00.000Z",
        body: "Action item: [Carol] Ship the corroborated action " +
          "https://docs.google.com/document/d/doc-a/",
      };
      writeFileSync(
        snapshotPath,
        JSON.stringify({ events: [], meeting_notes: [note] }),
        { mode: 0o600 },
      );
      chmodSync(snapshotPath, 0o600);
      const sourceTime = new Date("2026-07-29T19:00:00.000Z");
      utimesSync(snapshotPath, sourceTime, sourceTime);
      const binding = {
        connectionId: "synthetic-granola",
        sourceKind: "granola",
        tenantOrWorkspaceDigest: "a".repeat(64),
        accountOrPrincipalDigest: "b".repeat(64),
        grantVersion: "synthetic-grant",
      };
      const variants = taskMapGranolaVariants(snapshotPath, {
        observedAt: OBSERVED_AT,
        binding,
        knownDocumentIds: new Set(["doc-a"]),
      });
      const [variant] = variants.get("doc-a");
      assert.strictEqual(
        variant.observedAt,
        statSync(snapshotPath).mtime.toISOString(),
      );
      assert.ok(!JSON.stringify(variant.evidence).includes("Carol"));
      assert.deepStrictEqual(
        variant.evidence.map((row) => ({
          kind: row.kind,
          summary: row.summary,
          objectRefs: row.objectRefs,
        })),
        [{
          kind: "action_item",
          summary: "Ship the corroborated action",
          objectRefs: [],
        }],
      );

      writeFileSync(
        snapshotPath,
        JSON.stringify({
          events: [],
          meeting_notes: [{
            ...note,
            body: [
              note.body,
              "https://docs.google.com/document/d/doc-b/",
            ].join("\n"),
          }],
        }),
        { mode: 0o600 },
      );
      chmodSync(snapshotPath, 0o600);
      utimesSync(snapshotPath, sourceTime, sourceTime);
      const warnings = [];
      const originalConsoleError = console.error;
      console.error = (message) => warnings.push(String(message));
      let ambiguous;
      try {
        ambiguous = taskMapGranolaVariants(snapshotPath, {
          observedAt: OBSERVED_AT,
          binding,
          knownDocumentIds: new Set(["doc-a", "doc-b"]),
        });
      } finally {
        console.error = originalConsoleError;
      }
      assert.strictEqual(ambiguous.size, 0);
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /failure_digest/);
      assert.ok(!warnings[0].includes("doc-a"));
      assert.ok(!warnings[0].includes("doc-b"));

      const symlinkPath = join(root, "granola-link.json");
      symlinkSync(snapshotPath, symlinkPath);
      assert.throws(
        () => readAuthenticatedGranolaSnapshot(symlinkPath),
        /authentication failed/,
      );
      assert.throws(
        () => readAuthenticatedGranolaSnapshot(snapshotPath, {
          readBytes(descriptor) {
            writeFileSync(
              snapshotPath,
              JSON.stringify({ events: [], meeting_notes: [] }),
            );
            return readFileSync(descriptor);
          },
        }),
        /changed during read/,
      );

      writeFileSync(snapshotPath, "{malformed", { mode: 0o600 });
      chmodSync(snapshotPath, 0o600);
      const malformedWarnings = [];
      console.error = (message) => malformedWarnings.push(String(message));
      let optional;
      try {
        optional = loadTaskMapGranolaVariants(snapshotPath, {
          observedAt: OBSERVED_AT,
          binding,
          knownDocumentIds: new Set(["doc-a"]),
        });
      } finally {
        console.error = originalConsoleError;
      }
      assert.strictEqual(optional.size, 0);
      assert.strictEqual(malformedWarnings.length, 1);
      assert.match(malformedWarnings[0], /failure_digest/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("requires an established owner id for Task Map production", () => {
    const previousOwner = process.env.DAOBREW_USER_ID;
    const previousHome = process.env.HOME;
    const isolatedHome = mkdtempSync(
      join(tmpdir(), "gdocs-taskmap-owner-"),
    );
    delete process.env.DAOBREW_USER_ID;
    process.env.HOME = isolatedHome;
    try {
      assert.throws(
        () => parseArgs([
          "--export-taskmap-producer",
          "/tmp/synthetic-taskmap-producer.json",
          "--folder-id",
          "synthetic-folder",
          "--non-interactive",
        ]),
        /requires --user-id, DAOBREW_USER_ID, or configured user_id/,
      );
    } finally {
      rmSync(isolatedHome, { force: true, recursive: true });
      if (previousOwner === undefined) {
        delete process.env.DAOBREW_USER_ID;
      } else {
        process.env.DAOBREW_USER_ID = previousOwner;
      }
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });
});
