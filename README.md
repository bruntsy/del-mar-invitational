# Del Mar Invitational

Live golf scorecard app for the Del Mar Invitational group (Robbie, Jack, Brunts, Michael, Cole, Tom).

**Live URL:** https://bruntsy.github.io/del-mar-invitational/

---

## Stack

- Pure HTML/CSS/JS — single `index.html`, no build system
- [Supabase](https://supabase.com) for real-time sync and round history
- Hosted on GitHub Pages

---

## Features

### Setup Screen
- Course selector: Fairbanks Ranch or Torrey Pines South
- Drag-and-drop team builder (6 players → 2 teams of 3)
- Head-to-head matchup pairing (reorder with ▲▼)
- Bet amount inputs: Skins (pot), Best Ball (front/back/total), 2-Ball (front/back/total), H2H

### Scorecard Screen
- Horizontally scrollable 18-hole table
- Score inputs with live color coding (eagle/birdie/par/bogey/double)
- Stroke dots for handicap strokes
- Live skins count, net totals, Best Ball and 2-Ball team rows
- Auto-saves to localStorage on every keystroke
- Room code displayed in top-right corner

### Results Screen
- Settlement table: who pays who (P&L by Skins, Best Ball, 2-Ball, H2H)
- Individual leaderboard (sorted by net score)
- Team scores
- Skins breakdown (hole-by-hole, with carry/pot info and $/skin summary)
- H2H matchup results
- Best Ball and 2-Ball competition results

### Live Rooms (Supabase Real-Time)
- **Create Room** → generates a 4-char code, syncs all devices instantly
- **Join Room** → enter code to load current state and subscribe to live updates
- All setup choices, team assignments, bet amounts, and scores sync in real time (~600ms)
- Room code persists across page reloads
- Same room code works for multiple rounds — one code per weekend group

### Round History & Stats
- **Complete Round** button marks a round as finished and saves it to Supabase
- **Past Rounds** screen: all completed rounds with final leaderboard per round
- **All-Time Stats** screen: cumulative stats per player across all completed rounds
  - Rounds played, total skins won, avg net, best net, H2H record (W-L)

---

## Skins Format

Skins use a **pot model**: each player contributes `$X` to a shared pot upfront. At the end of the round, the pot is divided by total skins won to determine `$/skin`. Carries accumulate — a tied hole rolls the pot forward.

---

## Supabase Setup

Project: `del-mar-invitational` (us-west-1)

### Table Schema

```sql
create table rounds (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  state        jsonb not null default '{}',
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table rounds enable row level security;
create policy "anon full access" on rounds for all using (true) with check (true);

alter publication supabase_realtime add table rounds;
```

Note: `code` is intentionally **not unique** — one room code can have multiple rounds (one per course per session).

### Force schema cache reload (if needed)
```sql
notify pgrst, 'reload schema';
```

---

## Courses

| Course | Location | Handicaps |
|--------|----------|-----------|
| Fairbanks Ranch | Rancho Santa Fe, CA | Robbie 8, Michael 9, Cole 10, Jack 12, Brunts 14, Tom 16 |
| Torrey Pines South | La Jolla, CA | Robbie 11, Michael 11, Cole 13, Jack 16, Brunts 17, Tom 20 |

---

## Local Development

No build step — just open `index.html` in a browser:

```bash
open index.html
```

Real-time sync requires the Supabase credentials already embedded in the file. The anon/publishable key is safe to commit.

## Deploying

```bash
git add index.html
git commit -m "your message"
git push
```

GitHub Pages auto-deploys from `main`. Changes are live in ~1-2 minutes.

---

## Things To Work On

- [ ] Mobile score input UX improvements
- [ ] Show per-round money results in Past Rounds history
- [ ] Weekend leaderboard across multiple rounds (cumulative net)
- [ ] Push notifications when a score is entered
- [ ] Add more courses
