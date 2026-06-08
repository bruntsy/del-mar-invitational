import type { EventConfig } from './event';
import type { PlayerMap } from './player';
import type { RoundState } from './round';

/**
 * Wire-shape row types for the live Supabase schema (snake_case, matching the
 * DB columns the legacy app reads/writes). These describe what comes back from
 * `_db.from(...).select(...)`.
 *
 * Keep these distinct from the camelCase app-domain types (e.g. `Group` in
 * ./group). The normalize/serialize mapping between the two belongs to the
 * group-membership checkpoint, not here.
 */

/** `groups` table — see legacy/index.html:2088, :2166. */
export interface GroupRow {
  id: string;
  room_code: string;
  name: string;
  players: PlayerMap;
}

/** `rounds` table — see legacy/index.html:2094, :2848. `state` holds the round. */
export interface RoundRow {
  id: string;
  group_id: string;
  code?: string;
  state: RoundState;
  completed: boolean;
  completed_at?: string | null;
  created_at?: string;
}

/** `events` table — see legacy/index.html:2207. `config` holds the event. */
export interface EventRow {
  id: string;
  group_id: string;
  name: string;
  config: EventConfig;
  status: 'active' | 'archived';
  created_at?: string;
  updated_at?: string;
}
