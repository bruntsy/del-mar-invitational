import type { PlayerMap } from './player';

export interface Group {
  id: string | null;
  roomCode: string;
  name: string;
  players: PlayerMap;
}
