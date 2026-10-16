# Bomber-Chess

Bomberman on a chess board. You are a king, the bombs are chess pieces, and each one blows up exactly the squares it attacks. I wanted a small real time game to try peer to peer play on phones, and dropping a knight as a bomb was too funny an idea to leave alone. This is the first playable prototype: two players on one keyboard, or against a simple bot. Phone to phone play is the plan, not something that exists yet.

Live (once published): https://bomber-chess.jor.dev/

## Rules

1. You are a king. You walk up, down, left or right at about three squares a second, smoothly rather than square by square, and the game treats you as standing on whichever square your centre is on. In the open you can turn wherever you are. When something is in the way while you are off a lane, you get nudged sideways into the nearest open lane, the way Bomberman helps you around corners. No diagonals, kings walk through each other.
2. Drop a piece on the square you stand on. Two and a half seconds later it goes off and hits every square that piece attacks in chess: a rook sweeps its file and rank, a bishop its diagonals, a queen both, a knight jumps to its eight squares, a pawn hits the two diagonal squares ahead of it (ahead is up the board for white, down for black). Rubble, other pieces and kings stop sliding pieces, and that blocking square still gets hit. The square the piece stands on blows up too, so you cannot hide on top of your own piece.
3. A king on a hit square is captured and loses. If both kings go in the same tick it is a draw. Blasts linger for a moment, so walking into one also kills you.
4. A fused piece caught in a blast goes off immediately, so chains happen.
5. There is one drop button and it drops the active piece, shown as a badge on your king. After a drop the active piece moves on to the next best piece you hold, in the order queen, rook, bishop, knight, pawn, wrapping around from pawn back to your best piece. Pieces coming back or picked up never change the active piece, so what you are about to drop never swaps under you. You start with a knight active. Pawns never run out. Every other piece is out of your hands while it is fused and comes back to your inventory the moment it goes off, so a queen is one blast at a time, not one blast ever. There is no limit on how many pieces you can have fused, only that you cannot drop on a square that already holds one.
6. The board starts with about 45 percent rubble, except around the two corners where the kings start (white at a1, black at h8). Blowing up rubble has a 50 percent chance of uncovering a piece: a knight most often, then a bishop, then a rook, rarely a queen, and never more than one queen per game. Walk over it to pick it up. Pieces lying on the ground survive later blasts, so nothing you uncover gets lost.
7. Each player starts with one knight besides the endless pawns.
8. Nothing warns you where a fused piece will hit. You read the piece and its lines yourself, the way you read a bomb's range in Bomberman. Blasts are flames that linger for a moment.
9. The round lasts two minutes, then it is a draw.

I have only tuned the fuse, the walking speed and the rubble density by feel on my own machine. None of it is balanced yet.

## Modes

- **Versus bot**: you are white, black is a bot. It steps out of danger, walks to a square from which its next piece hits your king and drops it there, digs through rubble that is in the way, and picks up pieces lying around. It is deliberately beatable: it only thinks about three times a second, it does not notice your fused pieces until the fuse is under a second, it misjudges danger one time in five (never for a piece it stands on itself) and takes only half of its kill chances. Those numbers are at the top of `src/bot.js`. This is the default on touch screens.
- **Two players, one keyboard**: both kings are human. This is the default when a mouse or trackpad is detected.

## Controls

- White: WASD to move. Space drops your best piece.
- Black: arrow keys to move, Enter drops your best piece.
- Touch: the d-pad under the board moves white and the pink button in its middle drops. A small badge on each king shows the piece that drops next, each player block says it in words, the inventory outlines it, and on touch the drop button shows its glyph. The d-pad is hidden on desktop. I have only tried it with a mouse and a phone sized browser window so far, not on a real phone.

## How the game loop works

The simulation in `src/game.js` runs at a fixed 20 ticks per second and is deterministic: a seed sets up the rubble and every later random choice (which rubble hides a piece, which piece) comes from the same seeded generator. Kings walk in whole steps of a sixth of a square, one step per tick, so positions stay integers. Every tick takes one input per player, a held direction and whether to drop. Nothing else goes in. The page just feeds it keyboard, touch or bot inputs.

That shape is on purpose. For peer to peer play the idea is lockstep: both phones run the same simulation from the same seed and only exchange inputs per tick, so no game state ever has to cross the wire and neither side can fudge it. The networking is not built yet.

## Run locally

ES modules need an HTTP server, so `file://` will not work.

```sh
npm run serve
```

Then open http://localhost:6768.

Dev URL parameters: `?seed=<number>` replays a specific board for the first game, `?mode=bot|two` picks the opponent. New game keeps the mode and picks a fresh seed, and the address bar always shows the current seed so you can copy it.

## Files

```
index.html             the page
style.css              styles on top of the brand tokens, board colors and piece glyphs are content
src/main.js            wiring: game loop, inputs, rendering, settings
src/game.js            the deterministic simulation
src/chess.js           board helpers and the attack pattern of each piece
src/bot.js             the black bot
src/input.js           keyboard and touch input per player
src/render.js          board cells, inventory buttons and the timer
brand/                 jor.dev tokens, base styles, theme picker, fonts and logos
manifest.webmanifest   home screen name and icon
CNAME, .nojekyll, robots.txt, sitemap.xml   GitHub Pages hosting
```

## Hosting

Plain static files with relative paths, so it works on GitHub Pages at a custom domain or under a `/repo/` path.

- `favicon.svg`, `favicon.ico` and `apple-touch-icon.png` come from the brand install script. `og-image.png` is the 1200 by 630 social preview rendered with the brand's `og-image.sh`.
- `CNAME` contains `bomber-chess.jor.dev` and `.nojekyll` disables Jekyll. Add a DNS CNAME record `bomber-chess` pointing to `jorsanders.github.io` and enable Pages from the `main` branch, root folder.

## Any issues?

This is a hobby project I have spent quite some hours on. If you have any issues, feel free to open a GitHub issue or contact me. Otherwise, this code is unlicensed, so do whatever you want with it: https://unlicense.org/

## Buy me a coffee

Don't. If you let me know you used or enjoyed this, you have already made the best donation.
