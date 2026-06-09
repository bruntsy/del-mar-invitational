import { defineStore } from 'pinia';
import {
  DEFAULT_GROUP_NAME,
  GROUP_COLUMNS,
  generateCode,
  groupForDb,
  normalizeGroup,
} from '@/domain/group';
import { normalizePlayer } from '@/domain/players';
import { hasSupabase, supabase } from '@/services/supabase';
import { useRoundStore } from '@/stores/round';
import type { GroupRow } from '@/types/db';
import type { Group } from '@/types/group';
import type { PlayerMap } from '@/types/player';

const GROUP_KEY = 'dmi_group';
const RECENT_GROUPS_KEY = 'dmi_recent_groups';

/** A lightweight pointer to a previously-opened group, kept per browser. */
export interface RecentGroup {
  id: string | null;
  roomCode: string;
  name: string;
  updatedAt: string;
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/**
 * Group membership store. Ports the legacy create/join/leave/rename and
 * recent-group helpers (`legacy/index.html`) into Pinia.
 *
 * Local-first with a graceful no-credentials fallback: when `hasSupabase()` is
 * false, `createGroup` makes an offline group (null DB id) and remote-only
 * actions (`joinGroup`) surface a clear status instead of throwing. Loading a
 * group's active round/history is intentionally deferred to the next checkpoint.
 */
export const useGroupStore = defineStore('group', {
  state: () => ({
    group: null as Group | null,
    recentGroups: [] as RecentGroup[],
    status: '',
    statusError: false,
    busy: false,
  }),

  getters: {
    /** Active group's room code, or '' (legacy `groupCode()`). */
    groupCode(state): string {
      return state.group?.roomCode ?? '';
    },
    groupName(state): string {
      return state.group?.name || DEFAULT_GROUP_NAME;
    },
    hasGroup(state): boolean {
      return state.group !== null;
    },
  },

  actions: {
    /** Load the active group + recent groups from localStorage. */
    load(): boolean {
      if (hasLocalStorage()) {
        try {
          const raw = localStorage.getItem(GROUP_KEY);
          this.group = raw ? (JSON.parse(raw) as Group) : null;
        } catch {
          this.group = null;
        }
      }
      this.recentGroups = this.readRecentGroups();
      return this.group !== null;
    },

    persist() {
      if (!hasLocalStorage()) return;
      if (this.group) localStorage.setItem(GROUP_KEY, JSON.stringify(this.group));
      else localStorage.removeItem(GROUP_KEY);
    },

    setStatus(message: string, isError = false) {
      this.status = message;
      this.statusError = isError;
    },

    readRecentGroups(): RecentGroup[] {
      if (!hasLocalStorage()) return [];
      try {
        const parsed = JSON.parse(localStorage.getItem(RECENT_GROUPS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter((g) => g?.roomCode) : [];
      } catch {
        return [];
      }
    },

    saveRecentGroups(groups: RecentGroup[]) {
      this.recentGroups = groups.slice(0, 12);
      if (hasLocalStorage()) {
        localStorage.setItem(RECENT_GROUPS_KEY, JSON.stringify(this.recentGroups));
      }
    },

    /** Push the given group to the front of the recent list (legacy `rememberGroup`). */
    rememberGroup(group: Group | null = null) {
      group = group ?? this.group;
      if (!group?.roomCode) return;
      const next: RecentGroup = {
        id: group.id,
        roomCode: group.roomCode,
        name: group.name || DEFAULT_GROUP_NAME,
        updatedAt: new Date().toISOString(),
      };
      const rest = this.readRecentGroups().filter(
        (g) => g.roomCode !== next.roomCode && (next.id === null || g.id !== next.id),
      );
      this.saveRecentGroups([next, ...rest]);
    },

    forgetRecentGroup(roomCode: string) {
      this.saveRecentGroups(this.readRecentGroups().filter((g) => g.roomCode !== roomCode));
    },

    /** Create a group. Inserts a `groups` row when Supabase is configured, else local-only. */
    async createGroup(rawName: string): Promise<boolean> {
      const name = (rawName || '').trim() || DEFAULT_GROUP_NAME;
      this.busy = true;
      this.setStatus('Creating group...');
      try {
        if (!hasSupabase() || !supabase) {
          this.group = { id: null, roomCode: generateCode(), name, players: {} };
          this.persist();
          this.rememberGroup();
          this.setStatus('Offline group created (sync unavailable).');
          return true;
        }
        // Retry on the rare room_code collision, mirroring legacy createGroup().
        for (let attempt = 0; attempt < 5; attempt++) {
          const room_code = generateCode();
          const { data, error } = await supabase
            .from('groups')
            .insert({ room_code, name, players: {} })
            .select(GROUP_COLUMNS)
            .single();
          if (!error && data) {
            this.group = normalizeGroup(data as GroupRow);
            this.persist();
            this.rememberGroup();
            useRoundStore().subscribeToGroup(this.group.id);
            this.setStatus('');
            return true;
          }
          if (error && !String(error.message || '').includes('duplicate')) {
            this.setStatus('Error: ' + error.message, true);
            return false;
          }
        }
        this.setStatus('Could not create a unique group code. Try again.', true);
        return false;
      } finally {
        this.busy = false;
      }
    },

    /** Join an existing group by 4-char code (requires Supabase). */
    async joinGroup(rawCode: string): Promise<boolean> {
      const code = (rawCode || '').trim().toUpperCase();
      if (code.length !== 4) {
        this.setStatus('Enter a 4-character group code', true);
        return false;
      }
      this.busy = true;
      this.setStatus('Joining group...');
      try {
        if (!hasSupabase() || !supabase) {
          this.setStatus('Online sync is not configured; cannot join a remote group.', true);
          return false;
        }
        const { data, error } = await supabase
          .from('groups')
          .select(GROUP_COLUMNS)
          .eq('room_code', code)
          .single();
        if (error || !data) {
          this.setStatus('Group not found: ' + code, true);
          return false;
        }
        this.group = normalizeGroup(data as GroupRow);
        this.persist();
        this.rememberGroup();
        // Pull the group's latest in-progress round into the round store
        // (legacy `joinGroup` → `loadActiveRound`).
        const round = useRoundStore();
        await round.loadActiveRound(this.group.id);
        round.subscribeToGroup(this.group.id);
        this.setStatus('');
        return true;
      } finally {
        this.busy = false;
      }
    },

    /** Open a recent group by its code (legacy `switchToRecentGroup`). */
    async switchToRecentGroup(code: string): Promise<boolean> {
      return this.joinGroup(code);
    },

    leaveGroup() {
      useRoundStore().stopGroupSubscription();
      this.group = null;
      this.persist();
      this.setStatus('');
    },

    /** Rename the active group, syncing to Supabase when configured + persisted remotely. */
    async renameGroup(rawName: string): Promise<boolean> {
      if (!this.group) return false;
      const name = (rawName || '').trim();
      if (!name) {
        this.setStatus('Enter a group name.', true);
        return false;
      }
      if (name === this.group.name) {
        this.setStatus('');
        return true;
      }
      const previous = this.group.name;
      this.group.name = name;
      this.busy = true;
      this.setStatus('Saving...');
      try {
        if (hasSupabase() && supabase && this.group.id) {
          const { error } = await supabase
            .from('groups')
            .update({ name, players: this.group.players || {} })
            .eq('id', this.group.id);
          if (error) {
            this.group.name = previous;
            this.setStatus('Error: ' + error.message, true);
            return false;
          }
        }
        this.persist();
        this.rememberGroup();
        this.setStatus('');
        return true;
      } finally {
        this.busy = false;
      }
    },

    async saveGroup(): Promise<boolean> {
      if (!this.group) return false;
      this.busy = true;
      this.setStatus('Saving...');
      try {
        if (hasSupabase() && supabase && this.group.id) {
          const { error } = await supabase
            .from('groups')
            .update(groupForDb(this.group))
            .eq('id', this.group.id);
          if (error) {
            this.setStatus('Error: ' + error.message, true);
            return false;
          }
        }
        this.persist();
        this.rememberGroup();
        this.setStatus('');
        return true;
      } finally {
        this.busy = false;
      }
    },

    async addPlayer(rawName: string, rawHandicapIndex: number | string): Promise<boolean> {
      if (!this.group) return false;
      const player = normalizePlayer(rawName, { name: rawName, handicapIndex: Number(rawHandicapIndex || 0) });
      if (!player) {
        this.setStatus('Enter a player name.', true);
        return false;
      }
      if (normalizePlayerMap(this.group.players)[player.name]) {
        this.setStatus('Player already exists.', true);
        return false;
      }
      this.group.players = {
        ...normalizePlayerMap(this.group.players),
        [player.name]: player,
      };
      return this.saveGroup();
    },

    async updatePlayer(originalName: string, rawName: string, rawHandicapIndex: number | string): Promise<boolean> {
      if (!this.group) return false;
      const player = normalizePlayer(rawName, { name: rawName, handicapIndex: Number(rawHandicapIndex || 0) });
      if (!player) {
        this.setStatus('Enter a player name.', true);
        return false;
      }

      const players = normalizePlayerMap(this.group.players);
      if (!players[originalName]) {
        this.setStatus('Player not found.', true);
        return false;
      }
      if (player.name !== originalName && players[player.name]) {
        this.setStatus('Player already exists.', true);
        return false;
      }

      delete players[originalName];
      players[player.name] = player;
      this.group.players = players;
      return this.saveGroup();
    },

    async removePlayer(name: string): Promise<boolean> {
      if (!this.group) return false;
      const players = normalizePlayerMap(this.group.players);
      if (!players[name]) return true;
      delete players[name];
      this.group.players = players;
      return this.saveGroup();
    },
  },
});

function normalizePlayerMap(players: PlayerMap): PlayerMap {
  return Object.fromEntries(
    Object.entries(players || {})
      .map(([name, player]) => normalizePlayer(name, player))
      .filter((player): player is NonNullable<ReturnType<typeof normalizePlayer>> => player !== null)
      .map((player) => [player.name, player]),
  );
}
