"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWellFormedText = toWellFormedText;
exports.boundedUtf16 = boundedUtf16;
function toWellFormedText(value) {
    return value.toWellFormed();
}
function boundedUtf16(value, maximumUnits) {
    if (!Number.isInteger(maximumUnits) || maximumUnits <= 0) {
        throw new RangeError("maximumUnits must be a positive integer");
    }
    const normalized = toWellFormedText(value);
    if (normalized.length <= maximumUnits)
        return normalized;
    let end = maximumUnits - 1;
    const finalUnit = normalized.charCodeAt(end - 1);
    if (finalUnit >= 0xd800 && finalUnit <= 0xdbff)
        end -= 1;
    return `${normalized.slice(0, end)}…`;
}
