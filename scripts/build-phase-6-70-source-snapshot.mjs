#!/usr/bin/env node
// Build the Phase 6.70 connector snapshot from the read-only Google Calendar
// primary and Granola last_30_days reads captured in this Codex session.
//
// The script writes docs/loop/evidence/phase-6-70-source-coverage-snapshot.json.
// It does not call external APIs and does not write back to Calendar, Granola,
// Codex, Claude, or DaoBrew backend systems.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const OUTPUT = resolve(repoRoot, "docs/loop/evidence/phase-6-70-source-coverage-snapshot.json");

const existingEventIds = new Map([
  ["3khnfb5aj95d5q7sk3je8mtlh8", "gcal_3khnfb5aj95d5q7sk3je8mtlh8"],
  ["_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260527T180000Z", "gcal_weekly_daobrew_20260527"],
  ["_752kcc1h64p42b9p6d144b9k8h1jab9o70qjcba3851jge1n6gq42ca260", "gcal_ai2_meeting_20260528"],
  ["_clr78b9la93jetj46d5jihag94rkmra0clr6arjkecn6ot9edlgg", "gcal_ai_founders_meetup_20260528"],
  ["0e7aegb9gu1f68f820u05arhk4", "gcal_yifan_20260529"],
  ["bl56bd1dhe41qr9n8thel95pj8", "gcal_ai2_interview_20260601"],
  ["_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260610T180000Z", "gcal_weekly_daobrew_20260610"],
]);

const existingMeetingIds = new Map([
  ["94613b38-1c5b-4661-be77-3a87a36ec739", "granola_94613b38_1c5b_4661_be77_3a87a36ec739"],
  ["fc086a41-0600-4768-a521-e17828597834", "granola_fc086a41_0600_4768_a521_e17828597834"],
  ["ee8ab956-47d3-4ecb-8f7e-e41e507293ef", "granola_ee8ab956_47d3_4ecb_8f7e_e41e507293ef"],
  ["a57593d9-5485-4273-ab74-0808fe611729", "granola_a57593d9_5485_4273_ab74_0808fe611729"],
  ["d40dd37d-8af1-4c17-aa7f-383df4bc9713", "granola_d40dd37d_8af1_4c17_aa7f_383df4bc9713"],
]);

function hash(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function eventId(sourceRef) {
  return existingEventIds.get(sourceRef) ?? `gcal_${hash(sourceRef)}`;
}

function meetingId(sourceRef) {
  return existingMeetingIds.get(sourceRef) ?? `granola_${sourceRef.replace(/-/g, "_")}`;
}

function ts(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Invalid timestamp: ${iso}`);
  return Math.trunc(ms / 1000);
}

function classifyEvent(row, matchedGranolaRefs = []) {
  const response = row.response ?? null;
  const transparent = row.transparency === "transparent";
  const weakTitle = /(flight|stay at|tesla|lunch|winery|edc)$/i.test(row.title.trim());
  const declined = response === "declined";
  const evidenceStrength = matchedGranolaRefs.length
    ? "granola_calendar_biometric_candidate"
    : declined || transparent || weakTitle
      ? "weak_calendar_only"
      : "calendar_only_candidate";
  return {
    connector: "google_calendar",
    account: "Neo Zhang <zym1994815@gmail.com>",
    calendar_id: "primary",
    source_window: "2026-05-26T00:00:00-07:00/2026-06-25T23:59:59-07:00",
    my_response_status: response,
    transparency: row.transparency ?? null,
    status: "confirmed",
    import_policy: declined
      ? "imported_declined_not_promoted"
      : transparent || weakTitle
        ? "imported_calendar_only_weak"
        : matchedGranolaRefs.length
          ? "imported_calendar_granola_aligned_candidate"
          : "imported_calendar_only_candidate",
    evidence_strength: evidenceStrength,
    matched_granola_refs: matchedGranolaRefs,
    description_excerpt: row.excerpt ?? null,
    topic_tags: row.topics ?? [],
  };
}

function calendar(row, matchedGranolaRefs = []) {
  return {
    id: eventId(row.ref),
    source: "google_calendar",
    source_ref: row.ref,
    title: row.title.trim(),
    start_ts: ts(row.start),
    end_ts: ts(row.end),
    all_day: Boolean(row.allDay),
    attendee_count: row.attendeeCount ?? null,
    attendees: row.attendees ?? [],
    calendar_name: "primary",
    location: row.location ?? null,
    metadata: classifyEvent(row, matchedGranolaRefs),
  };
}

function granola(row) {
  return {
    id: meetingId(row.ref),
    source: "granola",
    source_ref: row.ref,
    event_id: row.eventRef ? eventId(row.eventRef) : null,
    kind: row.kind ?? "meeting",
    title: row.title.trim(),
    occurred_at_ts: ts(row.occurred),
    duration_sec: row.durationSec ?? null,
    participants: row.participants ?? [],
    summary: row.summary,
    body: null,
    topics: row.topics ?? [],
  };
}

const granolaRefsByEvent = new Map([
  ["3khnfb5aj95d5q7sk3je8mtlh8", ["94613b38-1c5b-4661-be77-3a87a36ec739"]],
  ["_752kcc1h64p42b9p6d144b9k8h1jab9o70qjcba3851jge1n6gq42ca260", ["fc086a41-0600-4768-a521-e17828597834"]],
  ["0e7aegb9gu1f68f820u05arhk4", ["ee8ab956-47d3-4ecb-8f7e-e41e507293ef"]],
  ["bl56bd1dhe41qr9n8thel95pj8", ["a57593d9-5485-4273-ab74-0808fe611729"]],
  ["_8go3idhn6gsjaba289342b9k74qk2b9p8d1k6b9g8p2k6ca168s32gi68c", ["a1346d6d-d224-4d56-9a27-96ca13d40299"]],
  ["_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260610T180000Z", ["d40dd37d-8af1-4c17-aa7f-383df4bc9713"]],
  ["5bc02e1nkj4lhsbj9i7r2gq52e", ["4a386281-dd08-418c-8611-0a77f8d1642b"]],
  ["nucojh2j0d1i4bcl17j0a4mels", ["5c7d18d4-3e82-4904-8e61-3017b07848ee"]],
  ["_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260617T180000Z", ["bb9a93d1-e7c3-43d5-b639-229abf08601f", "009ea2cb-e9c0-4847-9b3d-7c8f812f273a"]],
  ["icnf9di1jk7569233a27sr26ho", ["58c34846-cb32-4441-b5d4-635810d02c38", "560e61c0-c709-458b-8ad9-ba5450e70327"]],
  ["_clr78bbcf1am8ka399736haa954k6jq0clr6arjkecn6ot9edlgg", ["5a82f856-ffde-4ad5-80a1-fbea90a3fdec"]],
  ["v5ja0275o7bghssbbsq8bods9g", ["328b2ad7-ff8f-42ac-9e57-8ca5bf9749f5"]],
  ["_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260624T180000Z", ["567e40c6-912f-4ec3-8610-aa3996158f89"]],
]);

const calendarRows = [
  { ref: "3khnfb5aj95d5q7sk3je8mtlh8", title: "Sri <> DaoBrew (Yiming and Linhan)", start: "2026-05-26T09:00:00-07:00", end: "2026-05-26T09:45:00-07:00", response: "accepted", transparency: "opaque", location: "AI2 Incubator, Seattle", excerpt: "AI2 Incubator review, DaoBrew directions, founder collaboration context.", topics: ["#ai2", "#incubator", "#b2b", "#demo-readiness"] },
  { ref: "_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260527T180000Z", title: "Weekly sync - DaoBrew", start: "2026-05-27T11:00:00-07:00", end: "2026-05-27T12:00:00-07:00", response: "accepted", transparency: "opaque", topics: ["#daobrew", "#sync"] },
  { ref: "1ecq3cff1ct4k0969sn301fcsc", title: "Lunch, Neo", start: "2026-05-27T13:00:00-07:00", end: "2026-05-27T14:00:00-07:00", response: "needsAction", transparency: "opaque", topics: ["#personal"] },
  { ref: "5v7rnjrk3vsad2sfg31enhp9lo_20260528T010000Z", title: "普茵脉宝", start: "2026-05-27T18:00:00-07:00", end: "2026-05-27T19:00:00-07:00", response: "accepted", transparency: "opaque", topics: ["#partner", "#hardware"] },
  { ref: "_752kcc1h64p42b9p6d144b9k8h1jab9o70qjcba3851jge1n6gq42ca260", title: "AI2 meeting", start: "2026-05-28T10:30:00-07:00", end: "2026-05-28T11:30:00-07:00", response: "needsAction", transparency: "opaque", excerpt: "AI2 meeting with live demo, B2B/B2C, investor feedback, seed-round implications.", topics: ["#ai2", "#investor-facing", "#demo-readiness", "#b2b-track"] },
  { ref: "306h9ljiace8icu326bp4viob0", title: "Flight to San Francisco (AS 680)", start: "2026-05-28T13:50:00-07:00", end: "2026-05-28T16:04:00-07:00", response: "accepted", transparency: "transparent", location: "Seattle SEA", excerpt: "Gmail-created travel event.", topics: ["#travel"] },
  { ref: "_clr78b9la93jetj46d5jihag94rkmra0clr6arjkecn6ot9edlgg", title: "Seattle Consumer AI Founders Meetup (B2C)", start: "2026-05-28T17:00:00-07:00", end: "2026-05-28T18:30:00-07:00", response: "accepted", transparency: "opaque", location: "AI House, Seattle", excerpt: "B2C AI founders meetup at AI House, consumer AI, product-market fit, AI2 Incubator hosts.", topics: ["#ai2", "#founder", "#b2c", "#consumer"] },
  { ref: "0e7aegb9gu1f68f820u05arhk4", title: "Meet w/ Yifan", start: "2026-05-29T10:30:00-07:00", end: "2026-05-29T11:30:00-07:00", response: "accepted", transparency: "opaque", topics: ["#ai2", "#b2b", "#brand"] },
  { ref: "_70oj8e1i70o48b9i60q3ib9k6krj0b9o6kp3gba26ksk4chh6gqj2gi38c", title: "Extension/Return to Work", start: "2026-05-30T15:30:00-07:00", end: "2026-05-30T15:50:00-07:00", response: null, transparency: "opaque", location: "Healthie Video Call", topics: ["#health", "#recovery"] },
  { ref: "9r37h1fd71ketm139pfq8sbs6s", title: "Amber", start: "2026-05-31T10:00:00-07:00", end: "2026-05-31T11:00:00-07:00", response: null, transparency: "opaque", location: "120 Folsom St, San Francisco", topics: ["#personal"] },
  { ref: "_68qk2h9k61136b9l8d138b9k6kr3ib9o750jab9p6d334d9k8cq38h9i74", title: "DaoBrew · pre-meeting reset", start: "2026-05-31T15:25:00-07:00", end: "2026-05-31T15:28:00-07:00", response: null, transparency: "opaque", topics: ["#daobrew", "#recovery"] },
  { ref: "i83vq7mqjee0icoa4p388vkpgg", title: "Tesla", start: "2026-06-01T08:30:00-07:00", end: "2026-06-01T09:00:00-07:00", response: null, transparency: "opaque", topics: ["#personal"] },
  { ref: "_6l332e9i64r3gb9h6go3ab9k8ks46ba26cr42b9j8923ah22851k6chi84", title: "DaoBrew · pre-meeting reset", start: "2026-06-01T15:25:00-07:00", end: "2026-06-01T15:28:00-07:00", response: null, transparency: "opaque", topics: ["#daobrew", "#recovery"] },
  { ref: "_71246cq289132ba2691k2b9k6h332b9o6co3eba66kojch1n6sqj2chh6c", title: "DaoBrew · pre-meeting reset", start: "2026-06-01T15:25:00-07:00", end: "2026-06-01T15:28:00-07:00", response: null, transparency: "opaque", topics: ["#daobrew", "#recovery"] },
  { ref: "_88p44gpj8l0k6ba6692j2b9k6l142ba18kp4cb9m6srk4dq16d336d1m8o", title: "DaoBrew · pre-meeting reset", start: "2026-06-01T15:25:00-07:00", end: "2026-06-01T15:28:00-07:00", response: null, transparency: "opaque", topics: ["#daobrew", "#recovery"] },
  { ref: "bl56bd1dhe41qr9n8thel95pj8", title: "AI2 Incubator interview", start: "2026-06-01T15:30:00-07:00", end: "2026-06-01T16:30:00-07:00", response: null, transparency: "opaque", excerpt: "Demo seed: EventKit, reasoning citation, recovery action rescheduling; replace at stage time.", topics: ["#ai2", "#incubator", "#demo-readiness", "#mcp"] },
  { ref: "_8go3idhn6gsjaba289342b9k74qk2b9p8d1k6b9g8p2k6ca168s32gi68c", title: "Stress has a shape fireside chat demo", start: "2026-06-02T18:45:00-07:00", end: "2026-06-02T19:45:00-07:00", response: null, transparency: "opaque", excerpt: "Stress detection expert session, fight/flight, freeze/burnout, low energy, interventions, five stress patterns.", topics: ["#stress-patterns", "#depletion", "#tension", "#overdrive"] },
  { ref: "_clr78baba9972spgah6keuadddo3gca0clr6arjkecn6ot9edlgg", title: "Red Bull Basement World Final with 12 Scrappy Founders", start: "2026-06-03T16:30:00-07:00", end: "2026-06-03T23:30:00-07:00", response: "needsAction", transparency: "transparent", location: "Pier 48, San Francisco", excerpt: "World final and startup pitch event; calendar-only, transparent.", topics: ["#founder", "#pitch", "#weak-calendar"] },
  { ref: "5v7rnjrk3vsad2sfg31enhp9lo_20260604T010000Z", title: "普茵脉宝", start: "2026-06-03T18:00:00-07:00", end: "2026-06-03T19:00:00-07:00", response: "accepted", transparency: "opaque", topics: ["#partner", "#hardware"] },
  { ref: "a46kgooqs8353pqrsisf30tp48", title: "Stay at Trendy space in DT Tempe walk to coffee & brewery", start: "2026-06-05T00:00:00-07:00", end: "2026-06-10T00:00:00-07:00", allDay: true, response: "accepted", transparency: "transparent", location: "Tempe, AZ", excerpt: "Gmail-created lodging event.", topics: ["#travel"] },
  { ref: "ebtk0iir35t5ecg2gck1os5so8", title: "Stay at Sonesta Select Tempe Downtown", start: "2026-06-05T00:00:00-07:00", end: "2026-06-10T00:00:00-07:00", allDay: true, response: "accepted", transparency: "transparent", location: "Tempe, AZ", excerpt: "Gmail-created lodging event.", topics: ["#travel"] },
  { ref: "b0ohsi3buudo0h02q94jmedl4k", title: "Flight to Phoenix (AA 2414)", start: "2026-06-05T08:15:00-07:00", end: "2026-06-05T10:24:00-07:00", response: "accepted", transparency: "transparent", location: "San Francisco SFO", excerpt: "Gmail-created travel event.", topics: ["#travel"] },
  { ref: "jnmfktfjfd6l38rvb8jepljtho", title: "Yiming Zhang and Alex Lee", start: "2026-06-08T09:00:00-07:00", end: "2026-06-08T10:00:00-07:00", response: "accepted", transparency: "opaque", location: "Alee Athletics, Tempe", excerpt: "Calendly personal lesson.", topics: ["#personal", "#training"] },
  { ref: "184rcotho6b9ta8k2pmne8l3ag", title: "Flight to San Francisco (AA 2860)", start: "2026-06-09T14:05:00-07:00", end: "2026-06-09T16:06:00-07:00", response: "accepted", transparency: "transparent", location: "Phoenix PHX", excerpt: "Gmail-created travel event.", topics: ["#travel"] },
  { ref: "nnjgfvvlv1okvi04i8eu9l0pls", title: "Tesla Service Appointment", start: "2026-06-10T10:15:00-07:00", end: "2026-06-10T10:45:00-07:00", response: null, transparency: "opaque", location: "Tesla Service San Francisco-Van Ness", topics: ["#personal"] },
  { ref: "_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260610T180000Z", title: "Weekly sync - DaoBrew", start: "2026-06-10T11:00:00-07:00", end: "2026-06-10T12:00:00-07:00", response: "accepted", transparency: "opaque", excerpt: "B2C vs B2B, pricing tiers, memory/backend architecture, weekly summary, agent features.", topics: ["#daobrew", "#b2b-track", "#pricing", "#memory"] },
  { ref: "5v7rnjrk3vsad2sfg31enhp9lo_20260611T010000Z", title: "普茵脉宝", start: "2026-06-10T18:00:00-07:00", end: "2026-06-10T19:00:00-07:00", response: "accepted", transparency: "opaque", topics: ["#partner", "#hardware"] },
  { ref: "98vlkr0stlc829180gj0qd9mio", title: "Arham/Neo Coffee shop", start: "2026-06-11T15:30:00-07:00", end: "2026-06-11T16:30:00-07:00", response: "accepted", transparency: "opaque", topics: ["#personal"] },
  { ref: "5bc02e1nkj4lhsbj9i7r2gq52e", title: "meet w/Asaf", start: "2026-06-12T10:30:00-07:00", end: "2026-06-12T11:20:00-07:00", response: "accepted", transparency: "opaque", location: "1 California St, San Francisco", excerpt: "Meditation app, wearable retention, Oura target, HR/HRV, GTM and funding strategy.", topics: ["#wearables", "#overdrive", "#b2b", "#gtm"] },
  { ref: "q1s2f47kak6dos3h42j7m6r4vo", title: "Yiming Zhang and Alex Lee", start: "2026-06-12T13:30:00-07:00", end: "2026-06-12T14:30:00-07:00", response: "accepted", transparency: "opaque", location: "Google Meet", excerpt: "Calendly personal/virtual lesson.", topics: ["#personal", "#training"] },
  { ref: "nucojh2j0d1i4bcl17j0a4mels", title: "Neo Z and Info Cookiy", start: "2026-06-12T18:00:00-07:00", end: "2026-06-12T18:45:00-07:00", response: "accepted", transparency: "opaque", location: "Zoom", excerpt: "Cookiy AI Exclusive Demo, DaoBrew AI corporate email.", topics: ["#demo", "#ai"] },
  { ref: "6qoie48r4oiopejr3njkmae1a0", title: "Samuel", start: "2026-06-13T00:00:00-07:00", end: "2026-06-14T00:00:00-07:00", allDay: true, response: null, transparency: "transparent", topics: ["#personal"] },
  { ref: "_clr78bbkf91kmiq470o50cqhcss5kd20clr6arjkecn6ot9edlgg", title: "Sunrise Run, Coffee & DJ Set", start: "2026-06-13T07:00:00-07:00", end: "2026-06-13T09:30:00-07:00", response: "accepted", transparency: "opaque", location: "Golden Gate Promenade", excerpt: "Morning run, social coffee, live DJ set.", topics: ["#social", "#recovery"] },
  { ref: "sq3cfp6hufunsckmapl9u67mm8", title: "Winery", start: "2026-06-13T15:00:00-07:00", end: "2026-06-13T16:00:00-07:00", response: null, transparency: "opaque", location: "Los Gatos", topics: ["#personal"] },
  { ref: "_clr78b9kdp56idbfe576adi5d52jijq0clr6arjkecn6ot9edlgg", title: "Build with Claude AI. Lead Without Burning Out.", start: "2026-06-15T18:00:00-07:00", end: "2026-06-15T20:00:00-07:00", response: "accepted", transparency: "opaque", location: "Frontier Tower, San Francisco", excerpt: "Founders, AI operating system, nervous system, burnout, decision quality, automation.", topics: ["#burnout", "#ai", "#founder", "#depletion"] },
  { ref: "_clr78bac9gs46c39e4ok2sid9l6ncra0clr6arjkecn6ot9edlgg", title: "Codex Community Meetup - San Francisco", start: "2026-06-16T17:00:00-07:00", end: "2026-06-16T21:00:00-07:00", response: "accepted", transparency: "opaque", location: "Bright Data Web Data Loft", excerpt: "OpenAI Codex, agentic coding workflows, builders and founders.", topics: ["#codex", "#agentic", "#builder"] },
  { ref: "_clr78bb4f9ll6si7edcn4pbbc8rl4di0clr6arjkecn6ot9edlgg", title: "Foundry Live Demo Night", start: "2026-06-16T17:00:00-07:00", end: "2026-06-16T20:00:00-07:00", response: "declined", transparency: "opaque", location: "GitHub, San Francisco", excerpt: "Agentic AI demo night; declined invitation.", topics: ["#demo", "#declined"] },
  { ref: "_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260617T180000Z", title: "Weekly sync - DaoBrew", start: "2026-06-17T11:00:00-07:00", end: "2026-06-17T12:00:00-07:00", response: "accepted", transparency: "opaque", topics: ["#daobrew", "#sync"] },
  { ref: "5v7rnjrk3vsad2sfg31enhp9lo_20260618T010000Z", title: "普茵脉宝", start: "2026-06-17T18:00:00-07:00", end: "2026-06-17T19:00:00-07:00", response: "declined", transparency: "opaque", topics: ["#partner", "#declined"] },
  { ref: "icnf9di1jk7569233a27sr26ho", title: "Welcome David!", start: "2026-06-18T11:35:00-07:00", end: "2026-06-18T12:05:00-07:00", response: "accepted", transparency: "opaque", topics: ["#daobrew", "#team"] },
  { ref: "a4gspt451lk9knea6nkmu5n3jo", title: "Tesla Service Appointment", start: "2026-06-18T14:45:00-07:00", end: "2026-06-18T15:15:00-07:00", response: null, transparency: "opaque", location: "Tesla Service San Francisco-Van Ness", topics: ["#personal"] },
  { ref: "vcbp0ha62i5gphoubq51725o20", title: "Cecilia", start: "2026-06-18T17:00:00-07:00", end: "2026-06-18T18:00:00-07:00", response: null, transparency: "opaque", location: "1 Post St, San Francisco", topics: ["#personal"] },
  { ref: "0ega0rr1i1je3vpbpts4qvq3tk", title: "EDC", start: "2026-06-19T10:00:00-07:00", end: "2026-06-19T11:00:00-07:00", response: null, transparency: "opaque", location: "976 Mission St, San Francisco", topics: ["#personal"] },
  { ref: "_clr78bafb10nagq1dhj4aj3c60okusi0clr6arjkecn6ot9edlgg", title: "Build the Identity You Want to Be Known For", start: "2026-06-21T15:00:00-07:00", end: "2026-06-21T18:00:00-07:00", response: "accepted", transparency: "opaque", location: "Mountain View", excerpt: "Networking, vivid professional identity, carrying conversation context beyond the room.", topics: ["#identity", "#networking"] },
  { ref: "_clr78bbcf1am8ka399736haa954k6jq0clr6arjkecn6ot9edlgg", title: "Founder DJ Party", start: "2026-06-21T18:30:00-07:00", end: "2026-06-21T21:00:00-07:00", response: "accepted", transparency: "opaque", location: "Alamo Square Park", excerpt: "Founder/operator/investor social event, DJ set, outdoor networking.", topics: ["#founder", "#social", "#overdrive"] },
  { ref: "4as5k28b3cuu0e2ssdgprmjakk", title: "edc", start: "2026-06-22T10:00:00-07:00", end: "2026-06-22T11:00:00-07:00", response: null, transparency: "opaque", topics: ["#personal"] },
  { ref: "v5ja0275o7bghssbbsq8bods9g", title: "Jiaying ☕️", start: "2026-06-23T10:00:00-07:00", end: "2026-06-23T11:00:00-07:00", response: "accepted", transparency: "opaque", location: "168 2nd St, San Francisco", excerpt: "Startup opportunity insights: wearable AI intervention agent, B2B/B2C strategy, Reddit validation, sleep score anxiety, App Store review.", topics: ["#wearables", "#b2b", "#b2c", "#validation", "#app-store"] },
  { ref: "0cth0038v6qmo1a4dsh983dgek", title: "EDC", start: "2026-06-23T13:00:00-07:00", end: "2026-06-23T14:00:00-07:00", response: null, transparency: "opaque", topics: ["#personal"] },
  { ref: "3a8l3d534ee9q1085ij20r79ps", title: "Murad Chess", start: "2026-06-23T14:00:00-07:00", end: "2026-06-23T15:00:00-07:00", response: null, transparency: "opaque", topics: ["#personal"] },
  { ref: "_clr78bbd9pkkae9hb57n6tiqadpmkui0clr6arjkecn6ot9edlgg", title: "AI Helps You: From 0 To Content Creator", start: "2026-06-23T17:00:00-07:00", end: "2026-06-23T20:00:00-07:00", response: "accepted", transparency: "opaque", location: "1242 Market St, San Francisco", excerpt: "Hands-on AI tools workshop, build an AI agent live, demos and audience vote.", topics: ["#ai", "#demo", "#creator"] },
  { ref: "_clr78bb7a9akorrgetk6er2jf4r32ua0clr6arjkecn6ot9edlgg", title: "DeepTech Game Night with Alumni Ventures and Corgi", start: "2026-06-23T18:00:00-07:00", end: "2026-06-23T20:00:00-07:00", response: "accepted", transparency: "opaque", location: "Corgi Cafe, San Francisco", excerpt: "DeepTech founders, operators and investors, friendly competition, Alumni Ventures.", topics: ["#founder", "#investor", "#deeptech"] },
  { ref: "_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260624T180000Z", title: "Weekly sync - DaoBrew", start: "2026-06-24T11:00:00-07:00", end: "2026-06-24T12:00:00-07:00", response: "accepted", transparency: "opaque", excerpt: "Causal discovery, stress graph, root cause detonation, proactive intervention, paywall.", topics: ["#daobrew", "#causal-graph", "#detonator", "#demo-readiness"] },
  { ref: "_clr78bbd911kqsih85s68dbj6dmj0lq0clr6arjkecn6ot9edlgg", title: "The infrastructure behind Physical AI", start: "2026-06-24T15:00:00-07:00", end: "2026-06-24T17:30:00-07:00", response: "accepted", transparency: "opaque", location: "9Zero Climate Innovation Hub", excerpt: "Physical AI infrastructure, investors, robotics, models, implementation, applied layer.", topics: ["#ai", "#infrastructure", "#investor"] },
  { ref: "_clr78ba399sk4hakdp3mqtridko6sua0clr6arjkecn6ot9edlgg", title: "Skills & Agents - YC Founder Night", start: "2026-06-24T17:00:00-07:00", end: "2026-06-24T20:00:00-07:00", response: "accepted", transparency: "opaque", location: "Frontier Tower, San Francisco", excerpt: "YC founders, AI builders, demo to product to revenue to infra, agent markets.", topics: ["#yc", "#founder", "#demo", "#agents", "#infrastructure"] },
  { ref: "5v7rnjrk3vsad2sfg31enhp9lo_20260625T010000Z", title: "普茵脉宝", start: "2026-06-24T18:00:00-07:00", end: "2026-06-24T19:00:00-07:00", response: "accepted", transparency: "opaque", topics: ["#partner", "#hardware"] },
  { ref: "o4tb7cd7h1spnvo2mm3dluiv10", title: "Hui Nuo", start: "2026-06-25T14:00:00-07:00", end: "2026-06-25T15:00:00-07:00", response: null, transparency: "opaque", topics: ["#personal"] },
  { ref: "_clr78ba3c9o6glphd1qj0qbpd9j38e20clr6arjkecn6ot9edlgg", title: "AI Systems Happy Hour", start: "2026-06-25T19:00:00-07:00", end: "2026-06-25T20:30:00-07:00", response: "accepted", transparency: "opaque", location: "450 Bryant St, San Francisco", excerpt: "AI Infra Happy Hour, causal reasoning, agent memory, reliability, systems, production deployment.", topics: ["#ai", "#infrastructure", "#causal-reasoning", "#memory"] },
];

const granolaRows = [
  { ref: "94613b38-1c5b-4661-be77-3a87a36ec739", title: "Sri <> DaoBrew (Yiming and Linhan)", occurred: "2026-05-26T09:00:00-07:00", durationSec: 2700, eventRef: "3khnfb5aj95d5q7sk3je8mtlh8", participants: ["Neo Zhang", "Sri Chandrasekar", "Linhan Yang"], topics: ["#ai2", "#b2b", "#intervention", "#demo-readiness"], summary: "DaoBrew product vision: AI agent for personalized wellness interventions using real-time biometrics plus calendar, meetings, and messages. B2B-first strategy, wearable partners, Chinese pulse-reading partner, data flywheel, and AI2 Incubator program expectations were discussed." },
  { ref: "fc086a41-0600-4768-a521-e17828597834", title: "AI2 meeting", occurred: "2026-05-28T10:30:00-07:00", durationSec: 3600, eventRef: "_752kcc1h64p42b9p6d144b9k8h1jab9o70qjcba3851jge1n6gq42ca260", participants: ["Neo Zhang", "Linhan Yang"], topics: ["#ai2", "#demo-readiness", "#investor-facing", "#b2b-track"], summary: "Live adaptive breathing demo with Apple Watch, real-time HR, dynamic protocol generation, Snyder lab evidence, B2B integration with Precoin, $35K license plus per-session fees, investor feedback on value proposition, B2B vs B2C strategy, and seed-round next steps." },
  { ref: "ee8ab956-47d3-4ecb-8f7e-e41e507293ef", title: "Meet w/ Yifan", occurred: "2026-05-29T10:30:00-07:00", durationSec: 3600, eventRef: "0e7aegb9gu1f68f820u05arhk4", participants: ["Neo Zhang", "Yifan Zhang", "Linhan Yang"], topics: ["#ai2", "#brand", "#b2b", "#consumer"], summary: "DaoBrew pivot from sleep/TCM app to B2B AI wellness interventions. Yifan emphasized protecting the DaoBrew brand, avoiding white-label traps, using consumer brand awareness as leverage, and building a data flywheel for long-term direct consumer agent ambitions." },
  { ref: "a57593d9-5485-4273-ab74-0808fe611729", title: "AI2 Incubator interview", occurred: "2026-06-01T15:30:00-07:00", durationSec: 3600, eventRef: "bl56bd1dhe41qr9n8thel95pj8", participants: ["Neo Zhang"], topics: ["#ai2", "#mcp", "#calendar", "#granola", "#memory"], summary: "Technical discussion covering ML precision/recall, sample-rate tradeoffs, decoding randomness, visual app verification, personal memory/API setup, MCP integration with Calendar and Granola, device connectivity, and Swift collection uncertainties." },
  { ref: "a1346d6d-d224-4d56-9a27-96ca13d40299", title: "Event", occurred: "2026-06-02T17:44:00-07:00", durationSec: 7260, eventRef: "_8go3idhn6gsjaba289342b9k74qk2b9p8d1k6b9g8p2k6ca168s32gi68c", participants: ["Neo Zhang"], topics: ["#stress-patterns", "#tension", "#depletion", "#overdrive", "#b2b"], summary: "Expert perspectives on stress detection: fight/flight versus freeze/burnout, individualized biometric responses, wearable limitations, calming breathwork, stimulating techniques for low energy, agentic breathing app demo, five stress patterns, calendar and Granola triggers, B2B device partnerships, and adoption concerns." },
  { ref: "d40dd37d-8af1-4c17-aa7f-383df4bc9713", title: "Weekly sync - DaoBrew", occurred: "2026-06-10T11:00:00-07:00", durationSec: 3600, eventRef: "_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260610T180000Z", participants: ["Neo Zhang", "Linhan Yang"], topics: ["#b2b-track", "#pricing", "#memory", "#weekly-summary"], summary: "B2C versus B2B tracks, pricing tiers, presence strategy, upsell moments, signal tab subscription, memory architecture, vector database, backend/analogical graph, weekly summary, agentic proactive intervention, and MVP-blocking scope questions." },
  { ref: "4a386281-dd08-418c-8611-0a77f8d1642b", title: "meet w/Asaf", occurred: "2026-06-12T10:30:00-07:00", durationSec: 3000, eventRef: "5bc02e1nkj4lhsbj9i7r2gq52e", participants: ["Neo Zhang", "Asaf"], topics: ["#wearables", "#overdrive", "#b2b", "#gtm", "#oura"], summary: "Asaf discussed MediDojo meditation app, wearable users showing 4x retention, heart-rate recovery reports, GTM and CAC/LTV challenges, angel funding strategy, and Neo described DaoBrew breathwork plus stress detection, Overdrive pattern, Granola/calendar/memory context, Oura target, HRV limits, Whisper, and safety triage." },
  { ref: "5c7d18d4-3e82-4904-8e61-3017b07848ee", title: "Neo Z and Info Cookiy", occurred: "2026-06-12T18:00:00-07:00", durationSec: 2700, eventRef: "nucojh2j0d1i4bcl17j0a4mels", participants: ["Neo Zhang", "Joven Lee"], topics: ["#demo", "#weak-summary"], summary: "No summary" },
  { ref: "bb9a93d1-e7c3-43d5-b639-229abf08601f", title: "Weekly sync - DaoBrew", occurred: "2026-06-17T11:00:00-07:00", durationSec: 3600, eventRef: "_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260617T180000Z", participants: ["Neo Zhang", "Linhan Yang"], topics: ["#weak-summary"], summary: "Transcript too corrupted to reconstruct meeting content reliably; no decisions, action items, or discussion points could be extracted with confidence." },
  { ref: "009ea2cb-e9c0-4847-9b3d-7c8f812f273a", title: "Weekly sync - DaoBrew", occurred: "2026-06-17T11:00:00-07:00", durationSec: 3600, eventRef: "_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260617T180000Z", participants: ["Neo Zhang", "Linhan Yang"], topics: ["#weak-summary"], summary: "No summary" },
  { ref: "58c34846-cb32-4441-b5d4-635810d02c38", title: "Welcome David!", occurred: "2026-06-18T11:35:00-07:00", durationSec: 1800, eventRef: "icnf9di1jk7569233a27sr26ho", participants: ["Unknown"], topics: ["#team", "#weak-summary"], summary: "No summary" },
  { ref: "560e61c0-c709-458b-8ad9-ba5450e70327", title: "Welcome David!", occurred: "2026-06-18T11:35:00-07:00", durationSec: 1800, eventRef: "icnf9di1jk7569233a27sr26ho", participants: ["Neo Zhang", "Linhan Yang", "Jianxiam"], topics: ["#team", "#weak-summary"], summary: "No summary" },
  { ref: "5a82f856-ffde-4ad5-80a1-fbea90a3fdec", title: "Founder DJ Party", occurred: "2026-06-21T18:30:00-07:00", durationSec: 9000, eventRef: "_clr78bbcf1am8ka399736haa954k6jq0clr6arjkecn6ot9edlgg", participants: ["Neo Zhang"], topics: ["#founder", "#social", "#overdrive"], summary: "Late-night high-energy founder DJ party. Neo floated an unconventional investor pitch idea centered on taking investors to the gym, framed athletic identity as the hook, explored Many Worlds/Taoism ideas, and no commitments or follow-ups emerged." },
  { ref: "328b2ad7-ff8f-42ac-9e57-8ca5bf9749f5", title: "Startup opportunity insights", occurred: "2026-06-23T10:00:00-07:00", durationSec: 3600, eventRef: "v5ja0275o7bghssbbsq8bods9g", participants: ["Neo Zhang", "Yjykitty Yang"], topics: ["#wearables", "#b2b", "#b2c", "#validation", "#app-store", "#sleep-anxiety"], summary: "Jiaying's wearable-data AI intervention agent, Apple Watch/Huawei support, B2B/B2C strategy, B2E first customer, Reddit validation, sleep score anxiety feedback, App Store health-data review delays, TerraAPI/hardware strategy, and startup opportunity gap left by large companies." },
  { ref: "567e40c6-912f-4ec3-8610-aa3996158f89", title: "Weekly sync - DaoBrew", occurred: "2026-06-24T11:00:00-07:00", durationSec: 3600, eventRef: "_6l134h226123gba26opk4b9k8gq3eba1852jeba16p1j6dpl60skcha36c_20260624T180000Z", participants: ["Neo Zhang", "Linhan Yang"], topics: ["#causal-graph", "#detonator", "#demo-readiness", "#memory", "#paywall"], summary: "Product vision and positioning around causal discovery for health and intervention. Architecture: memory system, MCP, structural causal model, counterfactual stress graph, root-cause discovery and detonation. Demo readiness, proactive intervention trigger, budget/paywall, logs, engagement mechanics, and next steps for causal inference assumptions." },
];

const events = calendarRows.map((row) => calendar(row, granolaRefsByEvent.get(row.ref) ?? []));
const meeting_notes = granolaRows.map(granola);

const snapshot = {
  phase: "6.70",
  title: "Source Coverage + Pattern Completion",
  connector_read_at: "2026-06-25T00:00:00-07:00",
  accounts: {
    google_calendar: {
      name: "Neo Zhang",
      email: "zym1994815@gmail.com",
      calendar_id: "primary",
    },
    granola: {
      email: "zym1994815@gmail.com",
      active_workspace_id: "207ccce5-546e-4169-99f0-40d278831668",
      active_workspace_name: "Personal",
      revalidated_after_workspace_switch: true,
    },
  },
  connector_limits: {
    google_calendar: "primary calendar only; no calendar-list tool exposed; four bounded searches returned next_page_token=null",
    granola: "last_30_days only from active Personal workspace; full-history enumeration/folders unavailable in this session",
  },
  events,
  meeting_notes,
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(JSON.stringify({
  status: "written",
  output: OUTPUT,
  events: events.length,
  meeting_notes: meeting_notes.length,
}, null, 2));
