import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Thin Supabase client for the rewrite. Mirrors the legacy
 * `createClient(_SUPA_URL, _SUPA_KEY)` (legacy/index.html:1795), but reads the
 * URL/anon key from Vite env so they are not hardcoded.
 *
 * The client is `null` when either var is missing, so callers can degrade to a
 * local-first, no-credentials fallback instead of throwing. Use `hasSupabase()`
 * as the guard before any query.
 *
 * This module only constructs the client — no queries live here. The DB ⇄
 * domain mapping (normalizeGroup / groupForDb / normalizeRound) lands in the
 * group-membership checkpoint.
 */

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** True when the client is configured and safe to query. */
export function hasSupabase(): boolean {
  return supabase !== null;
}
