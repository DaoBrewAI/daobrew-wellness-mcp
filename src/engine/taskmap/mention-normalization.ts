const TERMINAL_PUNCTUATION = /(?:[.。!！?？:：;；]\s*)+$/u;

export function normalizeMentionText(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, " ")
    .replace(TERMINAL_PUNCTUATION, "")
    .trimEnd();
}
