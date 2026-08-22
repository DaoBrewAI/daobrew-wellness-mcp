export declare const TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION: "taskmap-local-calendar-export.v1";
export declare const TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION: "taskmap-google-calendar-provider-snapshot.v1";
export declare const TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION: "taskmap-calendar-producer-result.v1";
export declare const TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION: "taskmap-google-calendar-api.1";
export declare const TASKMAP_CALENDAR_OWNER_SCOPE_DOMAIN: "taskmap-owner-local.1";
export declare const TASKMAP_CALENDAR_MAX_AGE_MS: 14400000;
export declare const TASKMAP_LOCAL_CALENDAR_EVENT_IDENTITY_DOMAIN: "taskmap-local-calendar-event.1";
export declare const TASKMAP_GOOGLE_CALENDAR_EVENT_IDENTITY_DOMAIN: "taskmap-google-calendar-event.1";
export declare const TASKMAP_CALENDAR_CROSS_PROVIDER_IDENTITY_DOMAIN: "taskmap-calendar-cross-provider.1";
export declare const TASKMAP_CALENDAR_EVENT_REVISION_DOMAIN: "taskmap-calendar-event-revision.1";
export declare const TASKMAP_CALENDAR_LIMITS_V1: Readonly<{
    readonly maxEventsPerProvider: 256;
    readonly maxFileBytes: number;
}>;
declare const PRIVACY: Readonly<{
    readonly boundedTitlesStored: true;
    readonly attendeesStored: false;
    readonly locationsStored: false;
    readonly notesStored: false;
    readonly urlsStored: false;
    readonly rawProviderIdsStored: false;
    readonly credentialsStored: false;
    readonly localPathsStored: false;
}>;
export type TaskMapCalendarProvider = "local_calendar" | "google_calendar";
export interface TaskMapCalendarEventV1 {
    eventIdentityDigest: string;
    crossProviderIdentityDigest: string | null;
    revisionDigest: string;
    title: string;
    startAt: string;
    endAt: string;
}
export interface TaskMapLocalCalendarExportV1 {
    contractVersion: typeof TASKMAP_LOCAL_CALENDAR_EXPORT_VERSION;
    ownerScopeDigest: string;
    producedAt: string;
    validThrough: string;
    events: TaskMapCalendarEventV1[];
}
export interface TaskMapGoogleCalendarProviderSnapshotV1 {
    contractVersion: typeof TASKMAP_GOOGLE_CALENDAR_PROVIDER_SNAPSHOT_VERSION;
    snapshotDigest: string;
    producerVersion: typeof TASKMAP_GOOGLE_CALENDAR_PRODUCER_VERSION;
    ownerScopeDigest: string;
    producedAt: string;
    validThrough: string;
    events: TaskMapCalendarEventV1[];
    privacy: typeof PRIVACY;
}
export type TaskMapCalendarProviderFreshness = "current" | "boundary_due" | "stale" | "missing" | "malformed";
export interface TaskMapCalendarProviderStatusV1 {
    provider: TaskMapCalendarProvider;
    freshness: TaskMapCalendarProviderFreshness;
    producedAt: string | null;
    validThrough: string | null;
    eventCount: number;
    currentInputEligible: boolean;
}
export interface TaskMapCalendarProducerEventV1 extends TaskMapCalendarEventV1 {
    provider: TaskMapCalendarProvider;
}
export interface TaskMapCalendarProducerResultV1 {
    contractVersion: typeof TASKMAP_CALENDAR_PRODUCER_RESULT_VERSION;
    resultDigest: string;
    ownerScopeDigest: string;
    availability: "available" | "unavailable";
    assessedAt: string;
    providers: TaskMapCalendarProviderStatusV1[];
    events: TaskMapCalendarProducerEventV1[];
    privacy: typeof PRIVACY;
}
export interface TaskMapCalendarProducerLoadInputV1 {
    localExportPath: string;
    googleSnapshotPath: string;
    assessedAt: string;
    expectedOwnerScopeDigest: string;
}
export declare function taskMapCalendarOwnerScopeDigest(ownerUserId: string): string;
export declare function taskMapCalendarFieldDigest(domain: string, fields: readonly string[]): string;
export declare function buildTaskMapLocalCalendarExport(input: {
    ownerScopeDigest: string;
    producedAt: string;
    events: readonly TaskMapCalendarEventV1[];
}): TaskMapLocalCalendarExportV1;
export declare function taskMapLocalCalendarExportCanonicalJson(value: TaskMapLocalCalendarExportV1): string;
export declare function buildTaskMapGoogleCalendarProviderSnapshot(input: {
    ownerScopeDigest: string;
    producedAt: string;
    events: readonly TaskMapCalendarEventV1[];
}): TaskMapGoogleCalendarProviderSnapshotV1;
export declare function taskMapGoogleCalendarProviderSnapshotCanonicalJson(value: TaskMapGoogleCalendarProviderSnapshotV1): string;
export declare function assertTaskMapLocalCalendarExport(value: unknown, expectedOwnerScopeDigest: string): asserts value is TaskMapLocalCalendarExportV1;
export declare function assertTaskMapGoogleCalendarProviderSnapshot(value: unknown, expectedOwnerScopeDigest?: string): asserts value is TaskMapGoogleCalendarProviderSnapshotV1;
export declare function loadTaskMapCalendarProducerResult(input: TaskMapCalendarProducerLoadInputV1): Promise<TaskMapCalendarProducerResultV1>;
export declare function taskMapGoogleCalendarProviderSnapshotPath(absoluteHome: string): string;
export declare function taskMapCalendarResultCanonicalJson(result: TaskMapCalendarProducerResultV1): string;
export {};
