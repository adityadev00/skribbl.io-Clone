# EXPLAIN.md — Architecture, Decisions & Viva Defense Guide

How to use this: §0 is the 60-second pitch. §1–§3 are the story of the system. §4–§6 are "what if it breaks?". §7 maps every spec line to code. §8 is a rehearsal list of evaluator questions with crisp answers. §9 is honest limitations — admit these before you're asked.

---

## 0. The 60-second pitch

> "It's a server-authoritative multiplayer game. The browser only **draws and displays**; the Node server **decides everything** — whose turn it is, which word is secret, whether a guess is right, and the scores. Clients talk to the server over Socket.IO (WebSockets). A drawing is sent as a stream of tiny events with **normalized 0–1 coordinates**, and every client paints them onto the **same fixed 800×600 canvas bitmap**, so it looks identical on any screen. The server never sends the secret word to anyone except the drawer, and correct guesses are never echoed as text. If a player drops, they keep their seat for 30 seconds and get the full game state back on reconnect."

**Numbers worth remembering:** 5-char room codes · 2–20 players · 800×600 bitmap · points = 100 + up to 400 for speed · 15 s word choice · 5 s between turns · 30 s reconnect grace · 6 chat msgs / 3 s · 52 backend integration checks + 9 unit checks · 17 canvas-engine checks · 4 drawing-performance checks · 7 sound checks · 2 UI end-to-end tests (one plays a full 2-round game).

---

## 1. Architecture at a glance

```
 Browser (React)                                     Server (Node, one process)
┌───────────────────────────┐                 ┌─────────────────────────────────────────────┐
│ pages: Home / Room / Game │                 │ server.ts   Express (/health) + Socket.IO   │
│ GameContext (useReducer)  │◄── Socket.IO ──►│   │  identity: token → playerId (SessionStore)
│ Canvas (refs, no React    │   events + acks │   ▼                                         │
│   state for strokes)      │                 │ handlers/   lobby · game · drawing · chat   │
│ lib/socket.ts (singleton) │                 │   │  validate payload, call domain objects  │
└───────────────────────────┘                 │   ▼                                         │
                                              │ RoomManager ─► Room ─► Game  (+ Player)     │
                                              │   (registry,    (members, (turns, timers,   │
                                              │    grace timers) host)     hints, scoring,  │
                                              │                            stroke list)     │
                                              │   │ all output goes through Broadcaster ──► SocketBroadcaster ► io.to(room)…
                                              └─────────────────────────────────────────────┘
```

**Layering rule (say this in the viva):** *handlers translate sockets into method calls; domain classes (`Room`, `Game`, `Player`) contain all rules and never touch a socket.* They emit through a `Broadcaster` **interface**; `SocketBroadcaster` is the Socket.IO implementation. That is what made it possible to test game logic with a fake broadcaster and to run an end-to-end test without a browser.

| Class | Owns |
|---|---|
| `Player` | id, name, score, `hasGuessed`, `isConnected`, `isHost` |
| `Room` | code, members map, host, settings, current `Game`; host-only actions; membership events |
| `Game` | phase state machine, turn queue, timers (word-choice / turn / hints / round-end), hint mask, stroke list, guess checking, scoring, per-viewer state snapshots |
| `RoomManager` | all rooms, player→room index, **reconnect grace timers**, room-code generation |
| `SessionStore` | secret token ↔ public player id |
| `WordService` | word pool, random picks avoiding repeats |

---

## 2. Technology choices — the "why"

### 2.1 Why WebSockets (Socket.IO) — not HTTP polling, SSE or WebRTC

The workload is **many small, ordered, bidirectional messages with low latency** (a stroke produces dozens of points per second, plus chat, plus game events).

| Option | Why not (or why yes) |
|---|---|
| **HTTP polling** | Every update costs a full request (headers, TLS framing); to look real-time you poll every 100–300 ms per client, mostly returning nothing. Latency is bounded by the poll interval, server load scales with *clients × rate* even when idle. |
| **SSE** | Server→client only. Drawing and guessing need client→server too, so you would pair it with POSTs: two channels, no ordering guarantee between them. |
| **WebRTC** | Peer-to-peer. You'd still need a signalling server (a WebSocket anyway), STUN/TURN for NAT traversal, and up to 20 players means a 190-connection mesh. Worst: **no central authority** — the secret word and the scoring would live on a client, which is trivially cheatable. Its strengths (audio/video, lowest latency) aren't needed here. |
| **WebSocket** | One persistent full-duplex connection, tiny frames, server push, ordered delivery. ✔ |
| **Socket.IO vs raw `ws`** | Both allowed by the spec. Socket.IO gives **rooms** (broadcast to one game), **acknowledgements** (request/response for lobby actions with error codes), **automatic reconnection** and **fallback to long-polling** if a proxy blocks WebSockets. Cost: slightly larger frames and a non-standard protocol (needs `socket.io-client`). Worth it. |

### 2.2 Server-authoritative design

Clients send *intents* ("I guess X", "I draw here"); the server validates and decides. Consequences: the word never reaches guessers, scores can't be forged, a non-drawer's draw events are ignored, and every client converges on the same state because they all follow the server's broadcasts.

### 2.3 Canvas, normalized coordinates, fixed 800×600 bitmap

**Why `<canvas>` and not SVG.** A drawing is thousands of points. SVG makes a DOM node per stroke, so layout/paint cost grows with the drawing and undo/redraw gets slower. Canvas is one bitmap: constant paint cost. The paint bucket is also a **raster** operation (flood fill over pixels) — there is no equivalent in SVG without computing vector regions.

**Why a fixed bitmap + normalized coordinates (instead of letting the canvas resize).**
- Different players have different screens. If you sent raw pixels (`x=412`), a stroke would land in a different place on a smaller screen.
- Resizing a `<canvas>` element's `width/height` **clears it** and distorts aspect ratio.
- Our approach: the bitmap is always **800×600** internally (`CANVAS_W/H` in `lib/canvasEngine.ts`); CSS scales it to fit the screen. Points are sent as **`x/width, y/height` in 0..1**. Every client multiplies by 800/600, so geometry is identical everywhere. Brush sizes are in *bitmap* pixels, so they scale proportionally with the canvas too.
- Bonus: server-side validation is trivial — clamp to `[0,1]`, reject non-numbers.
- Trade-off to admit: on high-DPI/large screens the bitmap is upscaled and looks slightly soft. A `devicePixelRatio` scale factor is a possible later improvement.

### 2.4 `sessionStorage` (not `localStorage`) for identity — and the token/id split

- On first connect the server issues a **secret token** (24 random bytes) and a **public playerId** (6 random bytes). The client keeps the token and sends it in the Socket.IO handshake (`auth: { token }`) on every (re)connect. Same token → same player → same seat.
- **Why two values?** The public `playerId` is visible to everyone (player lists, chat payloads). If it were also the credential, any player could copy someone's id and hijack their seat. The token is never broadcast.
- **Why `sessionStorage`:** it is **per browser tab**, survives a refresh, and dies with the tab. That makes two tabs = two players (essential for testing and for opening your own invite link), and avoids a stale identity from yesterday. `localStorage` is shared by all tabs: two tabs would be the *same* player and fight over one seat. It's a one-word switch in `lib/session.ts` (`TOKEN_STORAGE`) if you ever want persistence across browser restarts. The display name (harmless) is stored in `localStorage` only as a prefill.

### 2.5 React 19 + Vite 7 + Tailwind v4 + TypeScript

- **React:** the spec's recommended stack. We use hooks, a context + `useReducer` (no extra state library). Honest note: nothing in the app depends on React-19-only features — it's simply the current stable version.
- **Vite 7:** instant dev server (native ESM), fast production build; requires **Node ≥ 20.19** (hence the README requirement).
- **Tailwind v4:** CSS-first configuration — design tokens live in an `@theme` block in `index.css`; one plugin (`@tailwindcss/vite`), **no `tailwind.config.js`**.
- **TypeScript everywhere (incl. backend):** shared mental model of payloads; the compiler catches event-shape mistakes. The frontend mirrors backend types in `types/game.ts` and `lib/events.ts` (single source of truth for event names).

### 2.6 OOP on the server

Bonus item in the spec; also simply the right shape: `Game` has a lifecycle and private mutable state (timers, queue, strokes) that must be changed only through guarded methods. Encapsulation means a handler *cannot* put the game in an illegal state — e.g. `chooseWord` throws unless phase is `choosing` and the caller is the drawer.

### 2.7 In-memory state — the trade-off

Rooms live in a `Map` in one Node process. Pros: zero latency, no infra, simple. Cons: **one instance only**, state is lost on restart. Scaling path: Socket.IO Redis adapter + room state in Redis, or shard rooms by code across instances with sticky routing. Not needed for the assignment, but know the answer (§8 Q11).

---

## 3. Pipelines and event flow

### 3.1 Connection & identity

```
client: io(url, { auth: cb => cb({ token: sessionStorage token }) })   ← function: re-read on EVERY reconnect
server: token known?  yes → same playerId     no → new playerId + new token
server: socket.join(playerId)                  ← every socket sits in a Socket.IO room named after its playerId
server: room = roomManager.handleReconnect(playerId)      ← cancels grace timer, marks online
server → client: 'session' { playerId, token? (only if newly issued), inRoom }
server → client: 'room_rejoined' { room, state }          ← only if inRoom
```
- `inRoom` is sent *before* the snapshot so the UI knows whether to wait for a restore (no flash of the "join" form).
- Naming each socket's own room `playerId` is how `Broadcaster.toPlayer(id)` and `toRoomExcept(code, id)` work — no socket-id bookkeeping.
- The provider registers its listeners **before** `socket.connect()` because these events fire immediately on connection.

### 3.2 Room lifecycle

| Step | Event (client→server) | What happens |
|---|---|---|
| Create | `create_room {hostName, settings}` | Settings validated against limits (2–20 players, 2–10 rounds, 15–240 s, 1–5 words, 0–5 hints) **before** leaving any current room; 5-char code from a 32-symbol alphabet (no 0/O/1/I) via `crypto.randomInt`, 33.5 M combinations |
| Join | `join_room {roomId, playerName}` | Code upper-cased & trimmed; room-full / bad name throw `GameError` (ack carries `{code,message}`); old room left only **after** success; ack returns room snapshot + game snapshot (late-joiner restore) |
| Settings | `update_settings` | Host only; only outside a running game; `maxPlayers` can't drop below current count; broadcast `room_updated` |
| Start | `start_game` | Host only; ≥ 2 **online** players; creates a fresh `Game` (also used for "Play again") |
| Leave | `leave_room` / grace expiry | Player removed; **host migrates** to the first online player; empty room destroyed (timers cleared) |

Typed errors: expected failures throw `GameError(code, message)`; the `on()` wrapper converts them to `{ok:false,error}` acks. Unexpected exceptions are logged and answered with a generic `INTERNAL` — a bad payload can't crash the process.

### 3.3 Turn state machine

```
                    start_game (host, ≥2 online)
        ┌─────────┐ ────────────────────────────►  ┌──────────┐
        │  lobby  │                                │ choosing │◄─────────────────────┐
        └─────────┘                                └────┬─────┘                      │
             ▲                           word_chosen     │  or 15 s → random auto-pick│
             │                                           ▼                            │
             │                                     ┌──────────┐   time up             │
   host: start_game ("play again")                 │ drawing  │   all guessed         │ 5 s pause,
             │                                     └────┬─────┘   drawer left         │ next drawer
        ┌────┴──────┐        no more turns              ▼                            │
        │ game_over │◄────────────────────────── ┌───────────┐ ────────────────────────┘
        └───────────┘     or < 2 online players  │ round_end │
                                                 └───────────┘
```
- **Turn queue:** at the start of each *round* the queue is the list of **online** players in join order. Each turn pops the next player, **skipping anyone who has since left or disconnected**. Queue empty → next round, or `game_over` after the last round. Total turns = players × rounds.
- **Timers** (all cleared in one `clearTimers()` and on `destroy()` → no leaks): word-choice (15 s), turn (`drawTime`), one per hint, round-end (5 s).
- **Early end** (`endTurn`): everyone online (except the drawer) has guessed → `all_guessed`; drawer leaves → `drawer_left`; clock → `time_up`.
- `endTurn` is guarded (`only from choosing/drawing`) so racing events (timer firing as the last guess arrives) can't double-end a turn.
- **Per-viewer snapshots:** `getStateFor(viewerId)` includes the word only if the viewer is the drawer (or the turn is over). `round_start` sends `wordOptions` only to the drawer (`sendTo`) and an empty list to everyone else (`broadcastExcept`).

### 3.4 Scoring (so you can compute it live)

- **Guesser:** `100 + round(400 × timeLeft / drawTime)`. Example: 80 s round, guess with 60 s left → 100 + 300 = **400**.
- **Drawer:** each correct guess gives the drawer `round(200 / numberOfGuessers)`; if everyone guesses, the drawer gets ≈ 200 total.
- Guards: drawer and players who already guessed can't score again (`not_allowed`); JS's single-threaded event loop processes two simultaneous guesses **one after the other**, so "first correct guess" is well-defined without locks.
- Leaderboard = players sorted by score; winner = rank 1 (ties broken by internal order).

### 3.5 Hints

Hint count = `min(settings.hints, letters − 1)` (never reveals the whole word). They fire at evenly spaced times: with 2 hints and 80 s → at 26.7 s and 53.3 s. Each reveals a random not-yet-revealed **letter** (spaces/hyphens are always shown). The server sends the mask as an array (`['_','_','a',' ','_']`) via `hint_update`; clients never see unrevealed letters.

### 3.6 Drawing pipeline (capture → render)

**Drawer, on `pointerdown/move/up`** (`Canvas.tsx`):
1. Pointer Events unify mouse/touch/pen; `touch-action: none` stops the page scrolling; `setPointerCapture` keeps receiving moves outside the canvas.
2. `getCoalescedEvents()` returns *every* sample the device produced since the last frame, so fast strokes stay smooth.
3. Convert `clientX/Y` → normalized `(x,y) ∈ [0,1]` using `getBoundingClientRect()`.
4. Skip points closer than 0.0015 (sub-pixel jitter) and round to 4 decimals (0.08 px) → fewer, smaller packets.
5. **Paint locally immediately** — all samples of one pointer event go into a single canvas path (one `stroke()` call).
6. **Batch the network**: points are buffered and flushed as ONE `draw_move {points:[…]}` per animation frame (≥16 ms apart ≈ 60 packets/s). `draw_start` and `draw_end` are immediate, and the buffer is flushed *before* `draw_end`/undo/clear so ordering is preserved. All drawing events are fire-and-forget (no ack).

**Server** (`Game.startStroke/addPoints/endStroke`; the legacy single-point `{x,y}` `draw_move` is still accepted): checks `phase === 'drawing' && sender === drawer`; clamps coordinates; validates colour `^#[0-9a-f]{6}$`; clamps size 1–60; appends to its own ordered **ops list**; broadcasts `draw_data` to everyone **except the drawer** (they already painted).

**Other clients**: append to their local ops list and paint the new piece.

**Smoothing:** joining raw points with straight lines looks jagged. Instead we draw a **quadratic Bézier through the midpoints** of consecutive points, with each real point as the control point. Incremental drawing (`drawLatest`) paints just the newest piece as points arrive; `drawTail` adds the last half-segment on `draw_end`. `renderOp` produces the **same geometry in one path**, so live strokes and replayed strokes look identical (verified: <0.5 % of pixels differ).

**Paint bucket:** a **scanline flood fill** on the pixel buffer (`getImageData` → fill spans using a stack + `seen` bitmap → `putImageData`). A tolerance of 40 per channel absorbs the anti-aliased fringe around strokes. Only `(x, y, colour)` is sent (`draw_fill`) — not pixels — and each client runs the same algorithm on its own identical canvas. Full-canvas fill takes ~16 ms. Limitation: browsers may anti-alias a few pixels differently, and a gap in an outline lets the fill leak (same as any bucket tool).

**Undo / clear / snapshot — one idea: an ordered ops list.** Every stroke *and* fill is an op `{kind, color, size, points}`. Undo = pop the last op and **replay** the rest on a cleared canvas; clear = empty list. The server keeps the same list, so a late joiner or reconnecting player receives `strokes` inside their `game_state` snapshot and replays it. Because fills are ops, undoing a fill works and fills are replayed in the right order.

**Why strokes bypass React state:** re-rendering a component tree 60× per second would be wasteful. Strokes live in `useRef` and are painted imperatively; React only handles UI (toolbar, overlays, chat).

### 3.7 Guess & chat pipeline (filtering and isolation)

All text goes through one function (`chatHandlers.processMessage`) — both `guess` and `chat` events use it, so **chat can't be used to smuggle the word**:

```
message arrives → trim, collapse spaces, ≤200 chars → rate limit (6 / 3 s / socket)
  phase ≠ drawing ........................ normal chat to everyone
  phase = drawing:
     sender = drawer OR already guessed ... delivered ONLY to drawer + players who have guessed  (channel 'guessed')
     else  matchGuess(text, word):
        correct   → text NEVER broadcast. Game awards points, emits guess_result {playerName, points}
                    (UI: "X guessed the word! +N") and players_update; ends turn if all guessed
        close     → shown to all as a normal guess + private "“text” is close!" to the sender
        incorrect → shown to all
```
- **Matching (`utils/wordMatcher.ts`):** normalize = `trim → lowercase → collapse whitespace`; **exact equality** = correct. "Partial" is handled as a *near miss*: Levenshtein distance 1 on words ≥ 5 letters → `close`. A substring like "eleph" for "elephant" is **not** accepted (deliberate, avoids guessing by prefix).
- **Secret isolation is enforced server-side:** the only place the word is sent is the drawer's `game_state`/`round_start`; a guesser's client physically never has it. The UI test asserts the word is absent from a guesser's DOM, chat log and every received payload.
- **XSS:** names/chat are rendered as React text (auto-escaped); no `dangerouslySetInnerHTML`; lengths capped server-side.

### 3.8 Frontend state flow

`lib/socket.ts` (singleton, `autoConnect:false`) → `GameProvider` registers listeners → each server event becomes a **reducer action** → components read via `useGame()` / `useRoom()`. The reducer (`gameReducer.ts`, a pure function) holds `room`, `game` view, chat `messages`, connection `status`, `ready`. `emitAck()` wraps emit-with-acknowledgement in a Promise with an 8 s timeout and preserves server error codes. Countdowns use `timeLeftMs` + local elapsed time since receipt, so **clock skew between client and server doesn't matter** (error ≈ half the network round trip).

### 3.9 Drawing performance model (why it doesn't lag)

Three different rates, kept apart:

| Rate | Source | What we do |
|---|---|---|
| **Input** (up to ~1000/s) | `pointermove` | No React state. Points go into refs and are painted straight onto the 2D context; all coalesced samples of one event become **one path / one `stroke()`** (a 20 000-point test: 3.8× less paint time than one stroke per point). |
| **Network** (≈ 60/s) | rAF-throttled flush | Points are buffered and sent as **one `draw_move {points}` per frame**, ≥ 16 ms apart (high-refresh displays wait a few frames). 300 samples → 5 packets instead of 300. |
| **React** (≈ 0/s while drawing) | re-renders | Only on tool/colour/size clicks and game events. A Profiler test counts **0 commits** across 300 pointer moves. |

Other details: the bounding box is **cached** (`getBoundingClientRect` once per stroke, invalidated on resize/scroll — calling it per sample forces layout); coordinates are rounded to 4 decimals; **`willReadFrequently` is deliberately not set** (it forces a CPU-backed canvas and slows every segment; we only read pixels on a bucket fill); remote batches are painted with the same single-path routine.

### 3.10 Sound effects (Web Audio, zero assets)

`lib/sound.ts` synthesises every sound with oscillators + gain envelopes (fast attack, exponential decay, never ramping to 0 — which browsers reject): **correct guess** (3-note arpeggio for you, a soft single ding for others), **tick** (square blip each second of the last 5; the final one is higher/longer), **turn start** (rising pop), **word chosen** (higher double pop), **game over** (arpeggio into a held chord). Autoplay policy: the `AudioContext` is created and resumed on the first pointer/key press, so earlier sounds are silently skipped. Wiring: `useSoundEffects` (mounted once in `GameProvider`) maps `round_start / game_state(drawing) / guess_result / game_over` to sounds; the tick lives in `<Timer>` beside the countdown. A mute button (persisted in `localStorage`) is on every screen.

### 3.11 Join Random Room

`room:join_random { playerName }` → `RoomManager.findRandomPublicRoom(playerId)` picks **uniformly at random** among rooms that are *public, still in the lobby, not full, with someone online*, and **never the caller's own room**. The name is validated first (a bad name is `INVALID_NAME`, not "no rooms"). Nothing eligible → the server emits **`room:error { code:'NO_ROOMS_AVAILABLE', message:'No rooms are currently available' }`** and also fails the ack with the same code; the UI shows a popup (focus moves in, Esc/backdrop/Close dismisses, focus returns to the button). Success → identical to `join_room` (socket moves rooms, late-joiner snapshot returned). Selection and exclusion rules are covered by `tests/room-manager.ts`.

---

## 4. Resiliency & edge cases

| Situation | Behaviour | Where |
|---|---|---|
| **Page refresh / flaky network** | Socket drops → player marked `isConnected:false`, seat held **30 s**. Reconnect with the same token → grace timer cancelled, `room_rejoined` restores room + full game snapshot (strokes, hint, timer). After 30 s → removed. | `RoomManager.handleDisconnect/Reconnect` |
| **Late joiner** | `join_room` ack includes `state` (current phase, hint, remaining time, **all strokes**); canvas replays them. They draw from the *next* round (not in the current queue). | `Game.getStateFor` |
| **Drawer disconnects** | Turn ends immediately (`drawer_left`), word revealed, next drawer after 5 s. (Chosen over freezing everyone for 30 s; a one-line change if you prefer.) | `Game.handlePlayerGone` |
| **Last un-guessed guesser disconnects** | Remaining online guessers all have `hasGuessed` → turn ends early (`all_guessed`) instead of waiting for the clock. | `checkAllGuessed` |
| **< 2 online players** | Game ends → podium. | `MIN_PLAYERS_TO_START` |
| **Host leaves** | After grace expiry, host passes to the first online player; flags update for everyone. | `Room.removePlayer` |
| **Everyone leaves** | Room destroyed, all timers cleared; each session token is dropped once its socket disconnects / grace expires — no leaks. | `RoomManager.detach`, `server.ts` |
| **Same player, two tabs/sockets** | Disconnect is ignored while another socket of that player is still in their `playerId` room. | `server.ts` |
| **Token expired / server restarted** | Unknown token → fresh identity, `inRoom:false` → client returns to home. | `SessionStore` |
| **Failed join must not kick you out** | New room joined first, old room left only on success. Same for create (validate, then leave). | `RoomManager.joinRoom/createRoom` |
| **Double "Start"** | `GAME_IN_PROGRESS` error. | `Room.startGame` |
| **Racing timers** | `endTurn`/`endGame` are idempotent guards; every timer cleared on phase change. | `Game` |
| **Message flooding** | Sliding-window limiter, 6 msgs / 3 s per socket → `RATE_LIMITED` ack. | `utils/RateLimiter.ts` |

### Anti-spoofing / input hardening

- **Authority checks:** drawing events are honoured only if the sender is the current drawer **and** phase is `drawing` (a spoofed `draw_start` from a guesser was tested and ignored). `word_chosen` must be one of the *offered* words. Settings/start are host-only.
- **Sanitization:** coordinates clamped to [0,1] and type-checked; colour hex-validated; brush size clamped 1–60; names ≤ 20, chat ≤ 200 chars; payloads that aren't objects are coerced to `{}`.
- **Resource caps:** ≤ 1500 drawing ops per turn, ≤ 6000 points per stroke, ≤ 64 points per batched message (invalid entries inside a batch are dropped). (Draw events are *capped* rather than rate-limited — a token bucket would be the next hardening step.)
- **Secrecy:** the session token is never broadcast; room codes are random; the word is never in any non-drawer payload.
- **Origin check:** `allowRequest` rejects WebSocket/polling connections from browsers on non-allow-listed origins (CORS alone doesn't stop a WebSocket upgrade).

---

## 5. Windows environment & build architecture

**Why `spawn('npx.cmd', …, { shell: true })` in `tests/integration.ts`.** On Windows `npx` is a batch wrapper (`npx.cmd`), not an executable. `spawn('npx')` fails (`ENOENT`), and since the 2024 Node security fix (CVE-2024-27980) Node also **refuses to spawn `.cmd`/`.bat` files without a shell** (`EINVAL`). So we use `npx.cmd` with `shell: true`. The code picks `npx.cmd` only when `process.platform === 'win32'`, so macOS/Linux still use plain `npx`.

**Why `taskkill`.** With `shell: true` the process tree is `cmd.exe → npx → node (tsx) → server`. `child.kill()` kills only the top `cmd.exe`; the actual server becomes an orphan **still holding port 3055**, so the next test run fails with `EADDRINUSE`. `taskkill /pid <pid> /T /F` kills the **whole tree** (`/T`) forcibly (`/F`). On other platforms `srv.kill()` is enough.

**Why `tsconfig.json` ≠ `tsconfig.build.json`.**
- `tsconfig.json` is for the **editor and `tsc --noEmit`**: `include: ["src/**/*", "tests/**/*"]` so VS Code gives the tests proper Node types (no red squiggles on `process`, `spawn`…).
- Including `tests/` is **incompatible with `rootDir: "src"`** — TypeScript reports "file is not under rootDir" (TS6059). That's why `rootDir` is commented out.
- But without `rootDir`, `tsc` computes the common root as `backend/`, and the output becomes `dist/src/server.js` — which would break `npm start` (`node dist/server.js`) and Render.
- Solution: `tsconfig.build.json` **extends** the base, sets `rootDir: "src"`, and includes only `src/` → output stays `dist/server.js`, tests are never shipped. `npm run build` uses it. (Verified: built server boots and passes `/health` + CORS checks.)

---

## 6. Deployment architecture

```
 Browser ──HTTPS──► Vercel (static: React build, SPA rewrite to index.html)
    │
    └──── WSS / HTTPS (Socket.IO) ──► Render web service (Node process, in-memory rooms)
```
- **Why split hosting:** Vercel/Netlify serve static files and short serverless functions; they can't keep a WebSocket open. Render runs a long-lived Node process → supports WebSockets. Also what the assignment suggests.
- **How the frontend finds the backend:** `VITE_SERVER_URL` is **inlined at build time** (Vite replaces `import.meta.env.*`). Changing it requires a redeploy. A value set in the Vercel dashboard overrides `.env.production` (shell env > `.env` files). A production build with no/placeholder URL shows a red "backend URL isn't configured" banner instead of failing silently.
- **How the backend allows the frontend (CORS):** `CLIENT_ORIGIN` is a comma-separated allow-list; `*` matches one DNS label, so `https://*.vercel.app` covers Vercel preview URLs. Same list is used by Express `cors`, Socket.IO's `cors`, and `allowRequest`. Requests without an `Origin` (curl, Render's health check, Node test clients) are allowed — CORS protects browsers, and we have no cookies; identity is a secret token. For strict production, list only the exact Vercel domain.
- **Port & health:** server listens on `process.env.PORT` (Render injects it); `/health` returns `{status:'ok'}` for Render's health check and uptime monitors.
- **Cold start:** free Render instances sleep after ~15 min; first request wakes them (30–60 s). The UI says so. Mitigation: ping `/health` every few minutes.
- **Single instance:** in-memory state → never scale beyond 1 instance without Redis.

---

## 7. Spec & evaluation alignment

### 7.1 Requirement checklist

| Spec requirement | Status | Where |
|---|---|---|
| **1. Multiplayer rooms** (create/join, public & private) | ✅ public rooms via **🎲 Join Random Room** (`room:join_random`); no browse list | `lobbyHandlers.ts`, `RoomManager.ts`, `CreateRoomForm/JoinRoomForm.tsx` |
| **2. Turn-based drawing** | ✅ | `Game.ts` (turn queue, phases) |
| **3. Real-time drawing via WebSockets** | ✅ | `Canvas.tsx`, `drawingHandlers.ts`, `canvasEngine.ts` |
| **4. Word system** (pick 1 of N, blanks/hints for others) | ✅ 1–5 choices | `WordService.ts`, `WordChoiceModal.tsx`, `WordHint.tsx` |
| **5. Scoring, leaderboard, winner** | ✅ | `Game.guesserPoints/awardDrawer`, `Scoreboard.tsx`, `GameOverScreen.tsx` |
| **6. WebSockets for drawing, guesses, chat, state** | ✅ | `config/events.ts` (single event table) |
| Create room with settings (players, rounds, time, words, hints) | ✅ all limits validated | `config/settings.ts`, `SettingsPanel.tsx` |
| Join via link or code | ✅ `/room/:code` + 5-char code (paste a link into the code box also works) | `RoomPage.tsx`, `parseRoomCode` |
| Lobby: player list, host starts | ✅ (ready-up button not implemented — host starts when ≥ 2 online) | `LobbyPage.tsx` |
| Brush, colours, size, undo, clear | ✅ 16 colours, 4 sizes, Ctrl+Z | `Toolbar.tsx` |
| Eraser *(nice to have)* | ✅ | `Canvas.tsx` |
| Fill bucket *(extra)* | ✅ synced + undoable | `canvasEngine.floodFill`, `Game.fill` |
| Hints (reveal letters over time) | ✅ | `Game.scheduleHints/revealHint` |
| Draw-time countdown | ✅ | `Timer.tsx` |
| Chat + guessing, correct-guess notification | ✅ masked | `chatHandlers.ts`, `ChatPanel.tsx` |
| Private rooms (invite link) | ✅ | `InviteLink.tsx`, `isPrivate` |
| Word categories *(nice)* | ◐ word list is stored by category (animals/objects/actions/food); players can't choose categories yet | `data/words.json` |
| Kick/ban, votekick *(nice)* | ❌ not built | — |
| Multiple word languages *(nice)* | ❌ | — |
| Deployment on Render/Vercel, live URL in README | ✅ configs + docs ready (URL = your deploy) | `render.yaml`, `vercel.json`, `README.md` |
| README + architecture overview + walkthrough readiness | ✅ | `README.md`, this file |
| **Bonus:** OOP server | ✅ | `Room`, `Game`, `Player`, `RoomManager` |
| **Bonus:** configurable room settings | ✅ | — |
| **Bonus:** word modes / moderation / custom words / avatars / spectator / replay | ❌ planned Phase 2 (avatars: coloured-initial placeholder only) | — |

### 7.2 Deliberate deviations from the suggested event table (be ready to justify)

| Spec suggests | We do | Why |
|---|---|---|
| `draw_data` broadcast to all *including drawer* | to everyone **except** the drawer | The drawer already painted locally; echoing adds latency and double-drawing. |
| `draw_data { ...stroke }` | incremental `{type: start|move|end|fill, …}` | Real-time: others see the stroke as it's drawn, not after it ends. |
| `round_start { drawerId, wordOptions, drawTime }` to everyone | drawer gets options; everyone else gets `wordOptions: []` | Secrecy of the offered words. |
| `game_state { phase, round, drawerId, word, hints }` | personalised per viewer (`word` only for drawer/after turn) | Secret word never leaves the server for guessers. |
| `guess_result` for every guess | only for **correct** guesses; wrong/close guesses arrive as `chat_message {type:'guess'|'close'}` | Correct text must never be broadcast. |
| `word_chosen` client→server | same, acknowledged | Errors (late pick, wrong word) return to the caller. |
| `draw_move { x, y }` | `{ points: [{x,y}, …] }` (≤ 64), one per animation frame; single-point form still accepted | Batching cuts packets ~5–20× and keeps the main thread free. |
| — | extra events: `room:join_random`, `room:error`, `session`, `room_rejoined`, `room_updated`, `players_update`, `hint_update`, `draw_fill`, `request_state`, `leave_room`, `list_rooms` | Reconnection, settings sync, scoreboard, hints, bucket, resync. |

### 7.3 The five "Code Understanding" topics → one-line answers

1. **Strokes captured / sent / rendered:** pointer events → normalized points → painted locally + `draw_*` events → server validates & stores in ordered op list → broadcast to others → each paints onto the same 800×600 bitmap with midpoint-Bézier smoothing (§3.6).
2. **Game state (rounds, turn order, scoring):** a `Game` object per room — phase state machine, turn queue per round, timers, scoring formula; clients are read-only views (§3.3–3.4).
3. **WebSockets:** one Socket.IO connection per client; rooms for broadcast, acks for request/response, auto-reconnect, per-player rooms for private messages (§2.1, §3.1).
4. **Word matching:** trim + lowercase + collapse spaces, exact equality; distance-1 near misses (words ≥ 5 letters) → "close" (§3.7).
5. **Deployment & constraints:** static frontend on Vercel, long-lived Node on Render because serverless can't hold WebSockets; build-time `VITE_SERVER_URL`; CORS allow-list; single instance (§6).

---

## 8. Likely evaluator questions — crisp answers

**Q1. Why did you choose Socket.IO over WebRTC or HTTP polling?**
Drawing needs low-latency, bidirectional, ordered messages. Polling wastes requests and adds latency; SSE is one-way; WebRTC is peer-to-peer and would put the secret word and scoring on a client (cheatable) and needs signalling + TURN anyway. Socket.IO adds rooms, acks, auto-reconnect and a long-polling fallback on top of WebSockets.

**Q2. How do you stop a guesser from seeing the word or drawing?**
Server-authoritative: the word is sent only to the drawer; `getStateFor(viewer)` redacts it. Drawing events are accepted only if `sender === drawer && phase === 'drawing'`. A spoofed `draw_start` from a guesser is ignored (tested).

**Q3. How can a stroke look identical on every screen size?**
A fixed 800×600 bitmap scaled with CSS, and points transmitted as 0–1 fractions. Every client maps fractions → the same bitmap pixels; brush size is in bitmap pixels so it scales with the board.

**Q4. Why not resize the canvas to the window?**
Changing a canvas's `width/height` clears it, different aspect ratios would distort the drawing, and raw pixel coordinates would mismatch between clients.

**Q5. Why Canvas and not SVG?**
Thousands of points → thousands of DOM nodes in SVG; canvas has constant cost. And the bucket fill is a pixel operation that SVG can't do.

**Q6. How do you make strokes smooth?**
Quadratic Bézier curves through the midpoints of consecutive points (real points as control points), plus coalesced pointer events for fast strokes and a small distance threshold to drop jitter. Live and replayed rendering produce the same geometry.

**Q7. How does the fill bucket work, and why only send (x, y, colour)?**
A scanline flood fill over `ImageData` with a tolerance for anti-aliased edges (~16 ms for the full canvas). Sending pixels would be ~1.9 MB (800×600×4); sending three numbers is tiny, and since every client has an identical canvas they compute the same result. Caveat: tiny anti-aliasing differences across browsers.

**Q8. How does undo work for both strokes and fills?**
Everything is an op in an ordered list (client and server). Undo pops the last op and replays the rest onto a cleared canvas, so undoing a fill restores the pixels underneath exactly.

**Q9. What happens if I refresh mid-game?**
The socket drops; the server marks you offline and holds your seat for 30 s. Your tab reconnects with the token from `sessionStorage`, the server recognises you, puts the socket back in the room and sends `room_rejoined` with the full snapshot (phase, hint, time left, all strokes). Chat history is client-side and isn't restored.

**Q10. Why `sessionStorage` instead of `localStorage`?**
Per-tab identity: two tabs are two players (needed for testing and opening your own invite), and no stale seat from an earlier session. One constant switches it.

**Q11. How would you scale this beyond one server?**
Move room/game state to Redis (or shard rooms by code), use the Socket.IO Redis adapter so broadcasts cross instances, and use sticky sessions for the polling transport. Timers would need to be owned by one instance per room.

**Q12. Two players guess correctly at the same instant — who wins?**
Node is single-threaded; the events are handled sequentially. The first processed gets more time-bonus; the second is processed after. `hasGuessed` makes a repeat guess a no-op. No locks needed.

**Q13. How do you avoid timer/memory leaks?**
Every timer is tracked and cleared in `clearTimers()` on each phase change and in `destroy()`; empty rooms are deleted; grace timers are cleared on reconnect/leave; session tokens are removed when no longer needed.

**Q14. How is the countdown synchronised across clients?**
The server sends `timeLeftMs`; the client counts down locally from the moment it received it. No dependence on synchronised clocks (error ≈ network latency / 2). The authoritative end is the server's timer.

**Q15. What stops chat from leaking the answer?**
All messages go through one pipeline. Correct guesses are never broadcast as text; the drawer's and already-correct players' messages go only to the "guessed" audience; everyone else's text is treated as a guess. The UI test confirms the word never appears in a guesser's payloads or DOM.

**Q16. How does word matching work? Is "partial" accepted?**
`trim → lowercase → collapse whitespace`, then exact equality. Near misses (Levenshtein distance 1, words ≥ 5 letters) give a private "is close!" but don't score. Prefixes/substrings are deliberately not accepted.

**Q17. Why is there an interface called `Broadcaster`?**
Dependency inversion: game logic emits through an interface, so it's independent of Socket.IO and testable with a fake. It also centralises the three delivery modes: to room, to room-except-one, to one player.

**Q18. Why OOP here?**
`Game` has a lifecycle and private mutable state (timers, queue, strokes). Encapsulation guarantees transitions only through guarded methods — e.g. `chooseWord` rejects wrong phase/caller — so handlers can't create illegal states.

**Q19. Why can't you deploy the backend on Vercel/Netlify?**
They run serverless functions with short lifetimes and no persistent connections; a WebSocket game server needs a long-lived process holding in-memory state. So: Vercel for static React, Render for Node.

**Q20. How do you handle the dynamic Vercel URLs and CORS?**
`CLIENT_ORIGIN` is an allow-list with a one-label wildcard (`https://*.vercel.app`), applied to Express CORS, Socket.IO CORS and an explicit `allowRequest` origin check. The frontend's `VITE_SERVER_URL` is baked in at build time and overridable from the Vercel dashboard.

**Q21. What would break if Render restarts?**
In-memory rooms vanish. Clients reconnect, the token is unknown, `inRoom:false` is sent, and they land on the home page. A persistent store (Redis) would fix it.

**Q22. Why TypeScript on the backend as well?**
Shared payload shapes and event names catch mistakes at compile time; the domain model (phases, DTOs) is self-documenting.

**Q23. How did you test it?**
(a) 52 socket-level integration checks (lobby, host rules, random join, drawing authority/clamping/batching, guess masking, channels, rate limit, reconnect, grace expiry, game over) + 9 unit checks for room selection; (b) a UI end-to-end test rendering the real React app against the live server, playing a full 2-round game with a second client; (c) canvas-engine checks on a real canvas (fill, undo replay, live-vs-replay equality incl. batched drawing); (c2) render/packet-count tests for the drawing path and a fake-`AudioContext` test for every sound; (d) typecheck + production builds.

**Q24. Is it secure?**
For its scope: server-side authority and validation, secret session tokens, origin checks, capped resource usage, escaped rendering. Not covered: accounts/auth, per-event rate limiting for drawing (capped instead), persistent moderation.

**Q25. What is `emitAck` and why use acks at all?**
A Promise wrapper over `socket.timeout(ms).emit(event, payload, cb)`. Lobby/game actions need success-or-error feedback (room full, not host…), so they use acks; drawing events are fire-and-forget because they're high-frequency and need no reply.

**Q26. Why a reducer for client state?**
Server events are naturally "actions"; a pure reducer makes transitions explicit and testable (and it's easy to reason about reconnect: `joined`/`session` actions simply replace state).

**Q27. What would you add next?**
Public-room browser, avatars, word modes (hidden/combination), custom words, kick/vote-kick, spectators, replay of the last round (the ops list already makes it straightforward), Redis for persistence/scaling.

**Q28. How did you eliminate drawing lag?**
By separating rates: input events paint straight to the canvas with no React state (one `stroke()` per event), network sends are batched once per animation frame (~60/s, max 64 points each), and React re-renders ≈ 0 times while drawing. I also cache the canvas bounding box and avoid `willReadFrequently`, which would force a CPU canvas. Tests: 0 React commits across 300 moves, 300 samples → 5 packets, 320 coalesced samples → 40 `stroke()` calls.

**Q29. Why synthesise sounds instead of shipping audio files?**
No assets to load, license or cache, instant start, tiny bundle. Oscillators + envelopes are enough for chimes/ticks/pops. Constraints: browsers need a user gesture before audio plays (we unlock on the first press), and every envelope must ramp to a positive value.

**Q30. How does "Join Random Room" avoid bad matches?**
Server-side filter: public, in the lobby (not mid-game), not full, someone online, and not the caller's own room; then a uniform random pick. If nothing matches the client gets `room:error` ("No rooms are currently available") and shows a popup.

---

## 9. Honest limitations (say them first)

- **In-memory, single instance:** restart = live rooms lost; can't scale horizontally without Redis.
- **Drawing events aren't rate-limited** (bounded by op/point caps and authority checks); a token bucket would be the next step.
- **Bucket fill** is tolerance-based: faint halos near strokes are possible, leaks through gaps, tiny cross-browser anti-aliasing differences.
- **Canvas is a fixed 800×600 bitmap:** slightly soft on very large/high-DPI screens.
- **Drawer reconnect mid-turn loses that turn** (by design; alternative: freeze up to 30 s).
- **No ready-up button, kick/ban, spectators, word categories UI, public-room browser, replay, custom avatars** — spec marks most as optional/bonus.
- **Chat history isn't restored after a reconnect** (client-side only).
- **Sounds and frame-rate were verified by tests, not by ear/eye:** the synth is checked against a fake `AudioContext` (notes, timing, envelopes, mute, autoplay unlock) and the drawing path by render/packet/`stroke()` counts in jsdom — real-browser FPS and how the sounds *feel* still need a human check.
- **Identity is per tab:** closing the tab forfeits the seat (after the grace period).
- **Free-tier cold starts** on Render.
- UI end-to-end and canvas tests were run in my verification environment (jsdom + a real canvas library), not in a real browser; backend integration tests ship in `backend/tests/`.

---

## 10. File map (where to point during a code walkthrough)

```
backend/src
  server.ts                 handshake → identity → reconnect → handlers → disconnect
  config/   events.ts constants.ts settings.ts cors.ts
  models/   Player.ts  Room.ts  Game.ts          ← core of the project
  services/ RoomManager.ts SessionStore.ts WordService.ts SocketBroadcaster.ts
  handlers/ context.ts(on(), errors) lobby game drawing chat
  utils/    wordMatcher.ts RateLimiter.ts errors.ts
backend/tests/integration.ts
frontend/src
  lib/      socket.ts session.ts canvasEngine.ts events.ts constants.ts
  context/  GameContext.tsx gameReducer.ts
  hooks/    useGame useRoom useNow useCopy
  pages/    HomePage RoomPage LobbyPage GamePage
  components/game/  Canvas Toolbar WordChoiceModal WordHint Timer TurnBanner
                    ChatPanel Scoreboard RoundEndOverlay GameOverScreen
  components/lobby/ CreateRoomForm JoinRoomForm PlayerList SettingsPanel InviteLink
```

**Suggested demo order in a viva:** open two tabs → create room (settings) → join via invite link → start → show word modal (drawer) vs "choosing" (guesser) → draw with fill/undo (watch the other tab) → wrong guess, close guess, correct guess (masked, +points) → refresh the guesser tab mid-turn (state restored) → finish → podium.
