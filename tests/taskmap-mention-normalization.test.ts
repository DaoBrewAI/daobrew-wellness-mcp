import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  normalizeMentionText,
} from "../src/engine/taskmap/mention-normalization.js";

describe("Task Map mention text normalization", () => {
  it("normalizes case, surrounding whitespace, and terminal punctuation", () => {
    assert.equal(normalizeMentionText(" Ship  the DMG! "), "ship the dmg");
  });

  it("preserves CJK while removing terminal CJK punctuation", () => {
    assert.equal(normalizeMentionText("完成迁移。"), "完成迁移");
  });

  it("preserves interior punctuation", () => {
    assert.equal(normalizeMentionText("v0.1.14 tag"), "v0.1.14 tag");
  });

  it("maps empty input to empty output", () => {
    assert.equal(normalizeMentionText(""), "");
  });

  it("NFC-normalizes and collapses internal Unicode whitespace", () => {
    assert.equal(normalizeMentionText(" CAFE\u0301\u2003SHIP "), "café ship");
  });

  it("removes repeated terminal punctuation and intervening whitespace", () => {
    assert.equal(normalizeMentionText("Ship it! \u3000？；  "), "ship it");
  });

  it("does not leave separator whitespace before terminal punctuation", () => {
    assert.equal(normalizeMentionText("Ship it \u3000! ?  "), "ship it");
  });
});
