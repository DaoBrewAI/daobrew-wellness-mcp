"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const cli_error_diagnostic_js_1 = require("./cli-error-diagnostic.js");
(0, node_test_1.describe)("Task Map CLI error diagnostics", () => {
    (0, node_test_1.it)("returns a stable fallback for a value without primitive coercion", () => {
        strict_1.default.equal((0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(Object.create(null)), "Unknown error (diagnostic unavailable)");
    });
    (0, node_test_1.it)("returns a stable fallback when non-Error string coercion throws", () => {
        const thrown = {
            toString() {
                throw new Error("nested formatting failure");
            },
        };
        strict_1.default.equal((0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(thrown), "Unknown error (diagnostic unavailable)");
    });
    (0, node_test_1.it)("uses the original message when reading an Error stack throws", () => {
        const thrown = new Error("original safe message");
        Object.defineProperty(thrown, "stack", {
            configurable: true,
            get() {
                throw new Error("stack getter failure");
            },
        });
        strict_1.default.equal((0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(thrown), "original safe message");
    });
    (0, node_test_1.it)("uses the original message when an Error stack is empty", () => {
        const thrown = new Error("message after empty stack");
        thrown.stack = "";
        strict_1.default.equal((0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(thrown), "message after empty stack");
    });
    (0, node_test_1.it)("byte-bounds multi-megabyte details with a stable marker", () => {
        const originalPrefix = "original diagnostic: ";
        const thrown = new Error("unused");
        thrown.stack = `${originalPrefix}${"\u{1F642}".repeat(1_000_000)}`;
        const diagnostic = (0, cli_error_diagnostic_js_1.formatTaskMapCliErrorDiagnostic)(thrown);
        strict_1.default.equal(Buffer.byteLength(diagnostic, "utf8"), cli_error_diagnostic_js_1.TASKMAP_CLI_ERROR_DIAGNOSTIC_MAX_BYTES);
        strict_1.default.equal(diagnostic.startsWith(originalPrefix), true);
        strict_1.default.equal(diagnostic.endsWith(cli_error_diagnostic_js_1.TASKMAP_CLI_ERROR_DIAGNOSTIC_TRUNCATION_MARKER), true);
        strict_1.default.equal(diagnostic.includes("\uFFFD"), false);
    });
});
