# The Resistance — Online

A web version of the board game **The Resistance** (base game, 5–10 players)
that you can play together in real time over the internet — create a lobby,
share the link, and play right in the browser, mobile included.

The build is a single Node.js process: Express serves the frontend files and
Socket.io handles all realtime communication. All game state lives in the
server's memory per lobby (no database).

## Contents

- [Test locally](#test-locally)
- [Deploy to Render (free, public link)](#deploy-to-render-free-public-link)
- [Free-tier limitations](#free-tier-limitations)
- [Project structure](#project-structure)
- [Assumptions made](#assumptions-made)
- [Extending the game](#extending-the-game)

## Test locally

Requires [Node.js](https://nodejs.org) 18 or later.

```bash
npm install
npm start
```

Then open `http://localhost:3000` in your browser. Feel free to open several
tabs (or have a friend on the same network open your local IP) to test with
multiple players at once.

### Automated tests

Two test scripts verify the game logic without needing to sit with multiple
browser tabs:

```bash
node scripts/test-rules.js       # Rules engine: missions, voting, win conditions
node scripts/simulate-game.js    # Full games with 5/7/10 bots + reconnect
```

If you want to manually click around the UI without opening 5–10 tabs, start
the server (`npm start`), create a lobby in the browser, and then in another
terminal run:

```bash
node scripts/fill-lobby.js YOUR-LOBBY-CODE
```

This fills the lobby with four bot players that auto-approve/play Success, so
you can watch the whole game flow in your own browser.

## Deploy to Render (free, public link)

Render was chosen because it can run a single Node process with WebSockets
with no extra configuration, and has a free tier. Here's how to connect your
GitHub repo to Render step by step:

1. **Put the code on GitHub** (if not already done):
   - Create a new repo at [github.com/new](https://github.com/new).
   - In the project folder, run:
     ```bash
     git init
     git add .
     git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
     git push -u origin main
     ```

2. **Create an account at [render.com](https://render.com)** and log in
   (signing in directly with your GitHub account works well).

3. Click **New +** → **Blueprint** (Render then reads the `render.yaml`
   already in the project and sets everything up automatically). If you
   don't see the Blueprint option, choose **New +** → **Web Service** instead.

4. Select your GitHub repo. Render will ask for access to the repo the first
   time — approve it.

5. If you used **Web Service** (not Blueprint) instead, fill in manually:
   - **Name**: anything, e.g. `the-resistance-online`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

6. Click **Create Web Service** (or **Apply** if you used Blueprint). Render
   builds and starts the server automatically — it takes a couple of minutes
   the first time.

7. Once it's done you'll get a public URL, something like
   `https://the-resistance-online.onrender.com`. That's your permanent game
   address — share it (or lobby links built from it, see below) with your
   friends.

Every time you push new changes to the `main` branch on GitHub, Render
automatically rebuilds and redeploys the app.

## Free-tier limitations

- **The server falls asleep when idle.** Render Free spins the service down
  after ~15 minutes without traffic. The next visitor has to wait 30–60
  seconds while the server wakes up ("cold start"). After that, everything's
  fast again.
- **Game state only lives in memory.** If the server falls asleep or restarts
  (e.g. on a new deploy), all in-progress lobbies and games disappear. Avoid
  redeploying while a game is underway.
- **Single instance.** The free plan only runs one server instance, which is
  exactly what we want here since game state lives in memory (multiple
  instances wouldn't share state).

If you play often and cold starts get annoying, Render's paid "Starter" tier
keeps the service warm, but it's not required for the game to work.

## Project structure

```
server/
  index.js       Express + Socket.io server, all socket communication
  game.js        The rules engine (Game class) — all game logic, testable in isolation
  rooms.js       Keeps track of all active lobbies/rooms in memory
  constants.js   Rules tables (spy counts, team sizes per player count)
public/
  index.html
  css/style.css  All the visuals — color palette, fonts, table layout, animations
  js/app.js      Client logic: routing between screens, rendering, interaction
  js/net.js      Socket.io connection + session/reconnect via localStorage
  js/svg.js      All hand-drawn SVG illustrations (card backs, roles, icons)
scripts/
  test-rules.js       Rules engine tests (no server needed)
  simulate-game.js    Full game simulation over socket.io
  fill-lobby.js       Manual test tool — fills a real lobby with bots
render.yaml      Render configuration
```

## Assumptions made

The spec was unusually detailed, but a few points called for a reasonable
assumption:

- **Votes are open, just like in the physical game** — everyone sees how
  everyone voted once the vote is revealed (that's how the original game
  works; only the *mission cards* stay secret even after being revealed,
  showing just the sabotage count, not who played them).
- **The leader's team picks are private until confirmed.** Other players
  don't see who the leader is "trying out" before they submit the final
  proposal — only the confirmed team is shown to everyone. That matches how
  the click feels (physical, not a form) without needing every intermediate
  click synced over the network.
- **If the host leaves the lobby** (before the game starts), the host role
  automatically moves to the next connected player, so the lobby never gets
  stuck without anyone able to start the game.
- **The host can remove a disconnected player** from the lobby before start
  (not a spec requirement, but useful if someone never comes back and you
  need to fill the seat with someone else).
- **Room codes** are 5 characters (excluding easily-confused characters like
  0/O or 1/I).

## Extending the game

The code is deliberately structured to be easy to build on:

- **New roles (e.g. Avalon-style Merlin/Assassin)**: `server/game.js` already
  has a `roles` Map (`playerId -> role name`) and `privateRoleInfo()` only
  sends each player what they're allowed to see. Add new role names in
  `constants.js`, extend the role assignment in `startGame()`, and add the
  matching UI logic (new SVG cards in `svg.js`, new overlay text in `app.js`).
- **More concurrent lobbies** is already handled (each lobby is its own
  `Game` instance in memory), so no changes are needed there to scale up the
  number of simultaneous tables.
- If game state needs to survive restarts in the future, `Game`'s state is
  already a simple, serializable structure (`toPublicState()` plus the
  private `roles` and `sessionToken` fields) — adding Redis or a database as
  a persistence layer only requires swapping out `RoomManager` in
  `server/rooms.js`.
