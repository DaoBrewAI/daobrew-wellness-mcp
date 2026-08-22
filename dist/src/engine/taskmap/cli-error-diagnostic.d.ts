export declare const TASKMAP_CLI_ERROR_DIAGNOSTIC_MAX_BYTES: number;
export declare const TASKMAP_CLI_ERROR_DIAGNOSTIC_TRUNCATION_MARKER = "\n[Task Map diagnostic truncated...]";
/**
 * Formats the original thrown detail for stderr without allowing diagnostic
 * handling itself to fail or grow without bound. This output is intentionally
 * sensitive, not redacted; native consumers must log it with private privacy.
 */
export declare function formatTaskMapCliErrorDiagnostic(error: unknown): string;
