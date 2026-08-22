"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MentionExtractionValidationError = exports.MENTION_EXTRACTION_LIMITS = void 0;
exports.isTaskMapMentionDisplayTextSafe = isTaskMapMentionDisplayTextSafe;
exports.assertTaskMapStrictJsonSyntaxAndUniqueKeys = assertTaskMapStrictJsonSyntaxAndUniqueKeys;
exports.validateMentionExtraction = validateMentionExtraction;
const text_contract_js_1 = require("./text-contract.js");
exports.MENTION_EXTRACTION_LIMITS = Object.freeze({
    maxMentions: 20,
    maxTitleCharacters: 80,
});
/**
 * A deliberately privacy-safe validation failure. The reason is suitable for
 * a per-note degradation report and never includes model output or note text.
 */
class MentionExtractionValidationError extends Error {
    reason;
    constructor(reason) {
        super(`Task Map mention extraction rejected: ${reason}`);
        this.reason = reason;
        this.name = "MentionExtractionValidationError";
    }
}
exports.MentionExtractionValidationError = MentionExtractionValidationError;
const TOP_LEVEL_KEYS = Object.freeze(["mentions"]);
const MENTION_KEYS = Object.freeze([
    "actor",
    "class",
    "confidence",
    "text",
    "title",
]);
const CLASSES = new Set([
    "request",
    "commitment",
    "decision",
    "other",
]);
const ACTORS = new Set(["self", "other", "unknown"]);
const TITLE_LINE_BREAK = /[\u2028\u2029]/u;
const UNICODE_CONTROL_CHARACTER = /\p{Cc}/u;
const TITLE_BIDI_CONTROL = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const NON_IMPERATIVE_ENDING = /[?？]\s*$/u;
const NON_MEANINGFUL_SCALAR = /[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Cc}]/u;
const MAX_JSON_NESTING = 64;
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    return actual.length === expected.length
        && actual.every((key, index) => key === expected[index]);
}
function containsMeaningfulScalar(value) {
    for (const scalar of value) {
        const codePoint = scalar.codePointAt(0);
        if (codePoint !== undefined
            && (codePoint < 0xd800 || codePoint > 0xdfff)
            && !NON_MEANINGFUL_SCALAR.test(scalar)) {
            return true;
        }
    }
    return false;
}
/**
 * Canonical safety gate for persisted mention-derived display text. Non-bidi
 * format controls needed by legitimate emoji/Indic shaping remain allowed only
 * when another meaningful scalar is present; Cc and bidi controls never are.
 */
function isTaskMapMentionDisplayTextSafe(value) {
    return containsMeaningfulScalar(value)
        && !UNICODE_CONTROL_CHARACTER.test(value)
        && !TITLE_BIDI_CONTROL.test(value);
}
function fail(reason) {
    throw new MentionExtractionValidationError(reason);
}
/**
 * JSON.parse applies last-member-wins semantics, so it cannot enforce a closed
 * schema by itself. This bounded lexer validates JSON structure and detects
 * duplicate decoded object member names (including equivalent `\u` escapes)
 * before the ordinary parse loses that information.
 */
class StrictJsonDuplicateKeyScanner {
    input;
    index = 0;
    constructor(input) {
        this.input = input;
    }
    scan() {
        this.skipWhitespace();
        this.parseValue(0);
        this.skipWhitespace();
        if (this.index !== this.input.length)
            fail("invalid_json");
    }
    parseValue(depth) {
        const token = this.input[this.index];
        if (token === "{") {
            if (depth >= MAX_JSON_NESTING)
                fail("invalid_json");
            this.parseObject(depth + 1);
            return;
        }
        if (token === "[") {
            if (depth >= MAX_JSON_NESTING)
                fail("invalid_json");
            this.parseArray(depth + 1);
            return;
        }
        if (token === '"') {
            this.parseString(false);
            return;
        }
        if (token === "t" && this.input.startsWith("true", this.index)) {
            this.index += 4;
            return;
        }
        if (token === "f" && this.input.startsWith("false", this.index)) {
            this.index += 5;
            return;
        }
        if (token === "n" && this.input.startsWith("null", this.index)) {
            this.index += 4;
            return;
        }
        if (token === "-" || (token !== undefined && token >= "0" && token <= "9")) {
            this.parseNumber();
            return;
        }
        fail("invalid_json");
    }
    parseObject(depth) {
        this.index += 1;
        this.skipWhitespace();
        if (this.input[this.index] === "}") {
            this.index += 1;
            return;
        }
        const keys = new Set();
        while (true) {
            if (this.input[this.index] !== '"')
                fail("invalid_json");
            const key = this.parseString(true);
            if (keys.has(key))
                fail("invalid_json");
            keys.add(key);
            this.skipWhitespace();
            if (this.input[this.index] !== ":")
                fail("invalid_json");
            this.index += 1;
            this.skipWhitespace();
            this.parseValue(depth);
            this.skipWhitespace();
            const delimiter = this.input[this.index];
            if (delimiter === "}") {
                this.index += 1;
                return;
            }
            if (delimiter !== ",")
                fail("invalid_json");
            this.index += 1;
            this.skipWhitespace();
        }
    }
    parseArray(depth) {
        this.index += 1;
        this.skipWhitespace();
        if (this.input[this.index] === "]") {
            this.index += 1;
            return;
        }
        while (true) {
            this.parseValue(depth);
            this.skipWhitespace();
            const delimiter = this.input[this.index];
            if (delimiter === "]") {
                this.index += 1;
                return;
            }
            if (delimiter !== ",")
                fail("invalid_json");
            this.index += 1;
            this.skipWhitespace();
        }
    }
    parseString(decode) {
        this.index += 1;
        let decoded = "";
        while (this.index < this.input.length) {
            const character = this.input[this.index];
            const codeUnit = character.charCodeAt(0);
            if (character === '"') {
                this.index += 1;
                return decoded;
            }
            if (codeUnit <= 0x1f)
                fail("invalid_json");
            if (character !== "\\") {
                if (decode)
                    decoded += character;
                this.index += 1;
                continue;
            }
            this.index += 1;
            const escape = this.input[this.index];
            if (escape === undefined)
                fail("invalid_json");
            const simpleEscape = {
                '"': '"',
                "\\": "\\",
                "/": "/",
                b: "\b",
                f: "\f",
                n: "\n",
                r: "\r",
                t: "\t",
            };
            const replacement = simpleEscape[escape];
            if (replacement !== undefined) {
                if (decode)
                    decoded += replacement;
                this.index += 1;
                continue;
            }
            if (escape !== "u")
                fail("invalid_json");
            const hexadecimal = this.input.slice(this.index + 1, this.index + 5);
            if (!/^[0-9a-fA-F]{4}$/u.test(hexadecimal))
                fail("invalid_json");
            if (decode)
                decoded += String.fromCharCode(Number.parseInt(hexadecimal, 16));
            this.index += 5;
        }
        fail("invalid_json");
    }
    parseNumber() {
        if (this.input[this.index] === "-")
            this.index += 1;
        if (this.input[this.index] === "0") {
            this.index += 1;
        }
        else {
            if (!this.isDigitOneToNine(this.input[this.index]))
                fail("invalid_json");
            while (this.isDigit(this.input[this.index]))
                this.index += 1;
        }
        if (this.input[this.index] === ".") {
            this.index += 1;
            if (!this.isDigit(this.input[this.index]))
                fail("invalid_json");
            while (this.isDigit(this.input[this.index]))
                this.index += 1;
        }
        if (this.input[this.index] === "e" || this.input[this.index] === "E") {
            this.index += 1;
            if (this.input[this.index] === "+" || this.input[this.index] === "-") {
                this.index += 1;
            }
            if (!this.isDigit(this.input[this.index]))
                fail("invalid_json");
            while (this.isDigit(this.input[this.index]))
                this.index += 1;
        }
    }
    isDigit(value) {
        return value !== undefined && value >= "0" && value <= "9";
    }
    isDigitOneToNine(value) {
        return value !== undefined && value >= "1" && value <= "9";
    }
    skipWhitespace() {
        while (this.input[this.index] === " "
            || this.input[this.index] === "\t"
            || this.input[this.index] === "\n"
            || this.input[this.index] === "\r") {
            this.index += 1;
        }
    }
}
function assertTaskMapStrictJsonSyntaxAndUniqueKeys(outputJson) {
    new StrictJsonDuplicateKeyScanner(outputJson).scan();
}
function validateMentionShape(value) {
    if (!isRecord(value) || !hasExactKeys(value, MENTION_KEYS)) {
        fail("invalid_mention");
    }
    if (typeof value.text !== "string"
        || typeof value.title !== "string"
        || typeof value.class !== "string"
        || typeof value.actor !== "string"
        || typeof value.confidence !== "number") {
        fail("invalid_mention");
    }
    return value;
}
function validateMention(value, sourceText) {
    const mention = validateMentionShape(value);
    const text = (0, text_contract_js_1.toWellFormedText)(mention.text);
    const rawTitle = (0, text_contract_js_1.toWellFormedText)(mention.title);
    const speechAct = mention.class;
    const actor = mention.actor;
    const confidence = mention.confidence;
    if (!containsMeaningfulScalar(text)
        || !(0, text_contract_js_1.toWellFormedText)(sourceText).includes(text)) {
        fail("invalid_span");
    }
    if (!isTaskMapMentionDisplayTextSafe(rawTitle)
        || rawTitle !== rawTitle.trim()
        || TITLE_LINE_BREAK.test(rawTitle)
        || NON_IMPERATIVE_ENDING.test(rawTitle)) {
        fail("invalid_title");
    }
    if (!CLASSES.has(speechAct)) {
        fail("invalid_class");
    }
    if (!ACTORS.has(actor)) {
        fail("invalid_actor");
    }
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        fail("invalid_confidence");
    }
    const title = (0, text_contract_js_1.boundedUtf16)(rawTitle, exports.MENTION_EXTRACTION_LIMITS.maxTitleCharacters);
    return {
        text,
        title,
        class: speechAct,
        actor: actor,
        confidence,
    };
}
/**
 * Strictly validates one station response against the exact source note.
 * Every entry is validated before the deterministic first-20 projection so a
 * malformed later entry can never be hidden by truncation.
 */
function validateMentionExtraction(outputJson, sourceText) {
    if (typeof sourceText !== "string")
        fail("invalid_source");
    if (typeof outputJson !== "string")
        fail("invalid_json");
    assertTaskMapStrictJsonSyntaxAndUniqueKeys(outputJson);
    let decoded;
    try {
        decoded = JSON.parse(outputJson);
    }
    catch {
        fail("invalid_json");
    }
    if (!isRecord(decoded)
        || !hasExactKeys(decoded, TOP_LEVEL_KEYS)
        || !Array.isArray(decoded.mentions)) {
        fail("invalid_top_level");
    }
    const validated = decoded.mentions.map((mention) => validateMention(mention, sourceText));
    return {
        mentions: validated.slice(0, exports.MENTION_EXTRACTION_LIMITS.maxMentions),
    };
}
