import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TASKMAP_CLI_ERROR_DIAGNOSTIC_MAX_BYTES,
  TASKMAP_CLI_ERROR_DIAGNOSTIC_TRUNCATION_MARKER,
  formatTaskMapCliErrorDiagnostic,
} from "./cli-error-diagnostic.js";

describe("Task Map CLI error diagnostics", () => {
  it("returns a stable fallback for a value without primitive coercion", () => {
    assert.equal(
      formatTaskMapCliErrorDiagnostic(Object.create(null)),
      "Unknown error (diagnostic unavailable)",
    );
  });

  it("returns a stable fallback when non-Error string coercion throws", () => {
    const thrown = {
      toString(): string {
        throw new Error("nested formatting failure");
      },
    };

    assert.equal(
      formatTaskMapCliErrorDiagnostic(thrown),
      "Unknown error (diagnostic unavailable)",
    );
  });

  it("uses the original message when reading an Error stack throws", () => {
    const thrown = new Error("original safe message");
    Object.defineProperty(thrown, "stack", {
      configurable: true,
      get(): never {
        throw new Error("stack getter failure");
      },
    });

    assert.equal(
      formatTaskMapCliErrorDiagnostic(thrown),
      "original safe message",
    );
  });

  it("uses the original message when an Error stack is empty", () => {
    const thrown = new Error("message after empty stack");
    thrown.stack = "";

    assert.equal(
      formatTaskMapCliErrorDiagnostic(thrown),
      "message after empty stack",
    );
  });

  it("byte-bounds multi-megabyte details with a stable marker", () => {
    const originalPrefix = "original diagnostic: ";
    const thrown = new Error("unused");
    thrown.stack = `${originalPrefix}${"\u{1F642}".repeat(1_000_000)}`;

    const diagnostic = formatTaskMapCliErrorDiagnostic(thrown);

    assert.equal(
      Buffer.byteLength(diagnostic, "utf8"),
      TASKMAP_CLI_ERROR_DIAGNOSTIC_MAX_BYTES,
    );
    assert.equal(diagnostic.startsWith(originalPrefix), true);
    assert.equal(
      diagnostic.endsWith(TASKMAP_CLI_ERROR_DIAGNOSTIC_TRUNCATION_MARKER),
      true,
    );
    assert.equal(diagnostic.includes("\uFFFD"), false);
  });
});
