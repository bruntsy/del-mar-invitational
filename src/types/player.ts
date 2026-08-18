export interface Player {
  name: string;
  handicapIndex: number;
}

export type PlayerMap = Record<string, Player | string>;
