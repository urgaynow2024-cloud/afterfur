/**
 * Compatibility shim for legacy imports/tests. Account switching now uses
 * src/lib/accountSessions.ts (isolated per-account Supabase auth storage).
 * This module stores non-sensitive display metadata only.
 */
export type { SavedAccountMeta as SavedAccount } from "./accountSessions";
export {
  readSavedAccounts,
  writeSavedAccounts,
  upsertSavedAccount,
  removeSavedAccount,
  touchSavedAccount,
  getSavedAccount,
} from "./accountSessions";
