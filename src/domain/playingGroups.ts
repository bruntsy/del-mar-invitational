import type { PairMatch, PlayingGroup } from '@/types';

export function autoPlayingGroups(players: string[]): PlayingGroup[] {
  const groups: PlayingGroup[] = [];

  for (let i = 0; i < players.length; i += 4) {
    groups.push({ name: `Group ${groups.length + 1}`, players: players.slice(i, i + 4) });
  }

  return groups;
}

export function autoPlayingGroupsForTeams(team1: string[], team2: string[]): PlayingGroup[] {
  const ordered: string[] = [];
  const max = Math.max(team1.length, team2.length);

  for (let i = 0; i < max; i += 1) {
    if (team1[i]) ordered.push(team1[i]);
    if (team2[i]) ordered.push(team2[i]);
  }

  return autoPlayingGroups(ordered);
}

export function autoPlayingGroupsFromPairMatches(
  pairMatches: PairMatch[],
  allPlayers: string[],
  team1: string[],
  team2: string[],
): PlayingGroup[] {
  const valid = new Set(allPlayers);
  const assigned = new Set<string>();

  const groups = pairMatches
    .filter((match) => match.a.length > 0 || match.b.length > 0)
    .map((match, index) => {
      const players = [...match.a, ...match.b].filter((player) => valid.has(player));
      players.forEach((player) => assigned.add(player));
      return { name: `Group ${index + 1}`, players };
    })
    .filter((group) => group.players.length > 0);

  const missing = allPlayers.filter((player) => !assigned.has(player));

  if (!groups.length) {
    return team1.length || team2.length
      ? autoPlayingGroupsForTeams(team1, team2)
      : autoPlayingGroups(allPlayers);
  }

  for (const player of missing) {
    const last = groups[groups.length - 1];
    if (last.players.length < 4) {
      last.players.push(player);
    } else {
      groups.push({ name: `Group ${groups.length + 1}`, players: [player] });
    }
  }

  return groups;
}

export function normalizePlayingGroups(
  groups: PlayingGroup[] | null | undefined,
  players: string[],
): PlayingGroup[] {
  const valid = new Set(players);
  const normalized = (Array.isArray(groups) ? groups : []).map((group, index) => ({
    name: group?.name || `Group ${index + 1}`,
    players: (Array.isArray(group?.players) ? group.players : []).filter((player) =>
      valid.has(player),
    ),
  }));

  const assigned = new Set(normalized.flatMap((group) => group.players));
  const missing = players.filter((player) => !assigned.has(player));

  if (!normalized.length || !normalized.some((group) => group.players.length > 0)) {
    return autoPlayingGroups(players);
  }

  for (const player of missing) {
    const target = normalized.find((group) => group.players.length < 4) ?? normalized.at(-1);
    target?.players.push(player);
  }

  return normalized.map((group, index) => ({
    name: group.name || `Group ${index + 1}`,
    players: group.players,
  }));
}
