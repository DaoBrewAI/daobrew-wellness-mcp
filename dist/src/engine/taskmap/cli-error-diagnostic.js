"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMAP_CLI_ERROR_DIAGNOSTIC_TRUNCATION_MARKER = exports.TASKMAP_CLI_ERROR_DIAGNOSTIC_MAX_BYTES = void 0;
exports.formatTaskMapCliErrorDiagnostic = formatTaskMapCliErrorDiagnostic;
exports.TASKMAP_CLI_ERROR_DIAGNOSTIC_MAX_BYTES = 16 * 1_024;
exports.TASKMAP_CLI_ERROR_DIAGNOSTIC_TRUNCATION_MARKER = "\n[Task Map diagnostic truncated...]";
const UNAVAILABLE_DIAGNOSTIC = "Unknown error (diagnostic unavailable)";
function errorDetail(error) {
    let isError = false;
    try {
        isError = error instanceof Error;
    }
    catch {
        // Fall through to guarded string coercion below.
    }
    if (isError) {
        try {
            const stack = error.stack;
            if (typeof stack === "string" && stack.length > 0) {
                return stack;
            }
        }
        catch {
            // A hostile stack getter must not break the outer failure contract.
        }
        try {
            const message = error.message;
            if (typeof message === "string" && message.length > 0) {
                return message;
            }
        }
        catch {
            // Fall through to guarded string coercion below.
        }
    }
    try {
        return String(error);
    }
    catch {
        return UNAVAILABLE_DIAGNOSTIC;
    }
}
function truncateUtf8(value) {
    const prefixLimit = exports.TASKMAP_CLI_ERROR_DIAGNOSTIC_MAX_BYTES
        - Buffer.byteLength(exports.TASKMAP_CLI_ERROR_DIAGNOSTIC_TRUNCATION_MARKER, "utf8");
    let totalBytes = 0;
    let prefix = "";
    for (const character of value) {
        totalBytes += Buffer.byteLength(character, "utf8");
        if (totalBytes <= prefixLimit) {
            prefix += character;
        }
        if (totalBytes > exports.TASKMAP_CLI_ERROR_DIAGNOSTIC_MAX_BYTES) {
            return `${prefix}${exports.TASKMAP_CLI_ERROR_DIAGNOSTIC_TRUNCATION_MARKER}`;
        }
    }
    return value;
}
/**
 * Formats the original thrown detail for stderr without allowing diagnostic
 * handling itself to fail or grow without bound. This output is intentionally
 * sensitive, not redacted; native consumers must log it with private privacy.
 */
function formatTaskMapCliErrorDiagnostic(error) {
    try {
        return truncateUtf8(errorDetail(error));
    }
    catch {
        return UNAVAILABLE_DIAGNOSTIC;
    }
}
