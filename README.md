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

### Group Flow
- Create or join a group with a 4-character group code
- Group hub with active round status, roster, past rounds, and all-time stats
- Group roster persists across rounds

### Round Setup
- Course search via Supabase Edge Function and GolfCourseAPI
- Tee selection with WHS course handicap preview
- Team builder (6 players → 2 teams of 3)
- Head-to-head matchup pairing (reorder with ▲▼)
- Bet amount inputs: Skins (pot), Best Ball (front/back/total), 2-Ball (front/back/total), H2H, Putt Poker

### Scorecard Screen
- Horizontally scrollable 18-hole table
- Score inputs with live color coding (eagle/birdie/par/bogey/double)
- Stroke dots for handicap strokes
- Live skins count, net totals, Best Ball and 2-Ball team rows
- Auto-saves to localStorage on every keystroke
- Group code displayed in top-right corner

### Results Screen
- Settlement table: who pays who (P&L by Skins, Best Ball, 2-Ball, H2H)
- Individual leaderboard (sorted by net score)
- Team scores
- Skins breakdown (hole-by-hole, no carry, with $/skin summary)
- H2H matchup results
- Best Ball and 2-Ball competition results

### Groups (Supabase Real-Time)
- **Create Group** → generates a 4-char code
- **Join Group** → enter code to load the group and latest active round
- Active round setup, team assignments, bet amounts, scores, and putts sync in real time (~600ms)
- Group code persists across page reloads
- One group can host many completed rounds

### Round History & Stats
- **Complete Round** button marks a round as finished and saves it to Supabase
- **Past Rounds** screen: all completed rounds with final leaderboard per round
- **All-Time Stats** screen: cumulative stats per player across all completed rounds
  - Rounds played, total skins won, avg net, best net, H2H record (W-L)

---

## Skins Format

Skins use a **pot model**: each player contributes `$X` to a shared pot upfront. Tied holes award no skin. At the end of the round, the pot is divided evenly by total skins won to determine `$/skin`.

---

## Supabase Setup

Project: `del-mar-invitational` (us-west-1)

### Table Schema

```sql
create table rounds (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  group_id     uuid references groups(id),
  state        jsonb not null default '{}',
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create table groups (
  id         uuid primary key default gen_random_uuid(),
  room_code  text unique not null,
  name       text not null default '',
  players    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table courses_cache (
  cache_key  text primary key,
  data       jsonb not null,
  cached_at  timestamptz not null default now()
);

alter table rounds enable row level security;
create policy "anon full access" on rounds for all using (true) with check (true);

alter table groups enable row level security;
create policy "anon full access" on groups for all using (true) with check (true);

alter table courses_cache enable row level security;
create policy "anon full access" on courses_cache for all using (true) with check (true);

create index if not exists rounds_group_id_idx on rounds(group_id);

alter publication supabase_realtime add table rounds;
```

`groups.room_code` is unique. `rounds.group_id` scopes active and completed rounds to a group.

### Edge Function Environment

`course-search` requires:

```bash
GOLF_COURSE_API_KEY=...
```

### Force schema cache reload (if needed)
```sql
notify pgrst, 'reload schema';
```

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
