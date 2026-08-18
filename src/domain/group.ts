import type { GroupRow } from '@/types/db';
import type { Group } from '@/types/group';

/** Default group name, matching the legacy monolith. */
export const DEFAULT_GROUP_NAME = 'Cushman Cup';

/** Columns selected for a `groups` row across queries. */
export const GROUP_COLUMNS = 'id,room_code,name,players';

// Excludes easily-confused characters (I, O, 0, 1), matching legacy generateCode().
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generate a 4-character room code (legacy `generateCode()`). */
export function generateCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Map a DB `groups` row to the camelCase app-domain Group (legacy `normalizeGroup`). */
export function normalizeGroup(row: GroupRow): Group {
  return {
    id: row.id ?? null,
    roomCode: row.room_code,
    name: row.name || DEFAULT_GROUP_NAME,
    players: row.players || {},
  };
}

/** Map an app Group to the DB column shape (legacy `groupForDb`). */
export function groupForDb(group: Group): Pick<GroupRow, 'room_code' | 'name' | 'players'> {
  return { room_code: group.roomCode, name: group.name, players: group.players || {} };
}
