import { canonicalUserId } from "../user-id.js";

export function requireUserId(value: unknown, context: string): string {
  const userId = canonicalUserId(value);
  if (!userId) {
    throw new Error(`${context}: canonical UUID user_id is required`);
  }
  return userId;
}
