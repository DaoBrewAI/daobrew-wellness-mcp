"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeMentionText = normalizeMentionText;
const TERMINAL_PUNCTUATION = /(?:[.。!！?？:：;；]\s*)+$/u;
function normalizeMentionText(value) {
    return value
        .normalize("NFC")
        .toLowerCase()
        .trim()
        .replace(/\s+/gu, " ")
        .replace(TERMINAL_PUNCTUATION, "")
        .trimEnd();
}
