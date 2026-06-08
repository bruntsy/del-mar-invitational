import type { Player, PlayerMap } from '@/types';

export function normalizePlayer(name: string, player: Player | string | undefined): Player | null {
  if (typeof player === 'string') {
    const clean = player.trim();
    return clean ? { name: clean, handicapIndex: 0 } : null;
  }

  const cleanName = (player?.name || name).trim();
  if (!cleanName) return null;

  return {
    name: cleanName,
    handicapIndex: Number(player?.handicapIndex ?? 0),
  };
}

export function normalizedGroupPlayers(players: PlayerMap | null | undefined): Player[] {
  return Object.entries(players ?? {})
    .map(([name, player]) => normalizePlayer(name, player))
    .filter((player): player is Player => player !== null);
}

export function groupPlayerNames(players: PlayerMap | null | undefined): string[] {
  return normalizedGroupPlayers(players).map((player) => player.name);
}

export function sortedGroupPlayers(players: PlayerMap | null | undefined): Player[] {
  return normalizedGroupPlayers(players).sort((a, b) => a.name.localeCompare(b.name));
}

export function groupPlayerByName(players: PlayerMap | null | undefined, name: string): Player | null {
  return normalizedGroupPlayers(players).find((player) => player.name === name) ?? null;
}
