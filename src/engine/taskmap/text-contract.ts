interface WellFormedStringRuntime {
  toWellFormed(): string;
}

export function toWellFormedText(value: string): string {
  return (value as unknown as WellFormedStringRuntime).toWellFormed();
}

export function boundedUtf16(value: string, maximumUnits: number): string {
  if (!Number.isInteger(maximumUnits) || maximumUnits <= 0) {
    throw new RangeError("maximumUnits must be a positive integer");
  }
  const normalized = toWellFormedText(value);
  if (normalized.length <= maximumUnits) return normalized;

  let end = maximumUnits - 1;
  const finalUnit = normalized.charCodeAt(end - 1);
  if (finalUnit >= 0xd800 && finalUnit <= 0xdbff) end -= 1;
  return `${normalized.slice(0, end)}…`;
}
