import { SQUARES, WALK_STEPS, attackedSquares, stepFrom } from "./chess.js";
import { FUSE_TICKS, STEPS_PER_SQUARE, blastSquares, canDrop, canMoveTo, createRandom, neighbours, nextPiece, pieceAt, playerAt } from "./game.js";

const THINK_EVERY_TICKS = 6;
const REACTION_TICKS = 10;
const TAKE_KILL_CHANCE = 0.5;
const DROP_CHANCE_PER_THINK = 0.25;
const ESCAPE_STEPS = 4;
const IMMINENT_FUSE_TICKS = 2 * STEPS_PER_SQUARE;

/** What the bot knows is dangerous: lingering flames, its own pieces, and enemy pieces it has had a moment to react to. Chain reactions escape it. With onlyImminent it marks just the flames and the pieces about to go off, the squares it must never cross. */
function dangerMap(state, colour, onlyImminent = false) {
  const danger = new Uint8Array(SQUARES);
  for (let square = 0; square < SQUARES; square += 1) {
    if (state.blasts[square] > 0) danger[square] = 1;
  }
  for (const piece of state.pieces) {
    if (piece.colour !== colour && piece.fuse > FUSE_TICKS - REACTION_TICKS) continue;
    if (onlyImminent && piece.fuse > IMMINENT_FUSE_TICKS) continue;
    for (const square of blastSquares(state, piece)) danger[square] = 1;
  }
  return danger;
}

function shuffledSteps(random) {
  const steps = WALK_STEPS.slice();
  for (let index = steps.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [steps[index], steps[other]] = [steps[other], steps[index]];
  }
  return steps;
}

/** Breadth first search from the bot's square. Returns the path of squares to the nearest square that satisfies isGoal, or null. With throughRubble the search may cross rubble, which gives a digging route. The step order is shuffled so the bot has no favourite direction. */
function pathToward(state, player, isGoal, avoid, steps, throughRubble = false) {
  const cameFrom = new Map([[player.square, null]]);
  const queue = [player.square];
  while (queue.length > 0) {
    const square = queue.shift();
    if (square !== player.square && isGoal(square)) {
      const path = [];
      for (let step = square; step !== player.square; step = cameFrom.get(step)) path.unshift(step);
      return path;
    }
    for (const [rowDelta, columnDelta] of steps) {
      const next = stepFrom(square, rowDelta, columnDelta);
      if (next < 0 || cameFrom.has(next) || avoid[next]) continue;
      if (!canMoveTo(state, player, next) && !(throughRubble && state.blocks[next] === 1)) continue;
      cameFrom.set(next, square);
      queue.push(next);
    }
  }
  return null;
}

function firstStepToward(state, player, isGoal, avoid, steps) {
  const path = pathToward(state, player, isGoal, avoid, steps);
  return path ? directionBetween(player.square, path[0]) : null;
}

function directionBetween(from, to) {
  for (const [rowDelta, columnDelta] of WALK_STEPS) {
    if (stepFrom(from, rowDelta, columnDelta) === to) return [rowDelta, columnDelta];
  }
  return null;
}

function chebyshevDistance(a, b) {
  return Math.max(Math.abs(Math.floor(a / 8) - Math.floor(b / 8)), Math.abs((a % 8) - (b % 8)));
}

function dropSquares(state, player, from = player.square) {
  const isBlocked = (square) => state.blocks[square] === 1 || pieceAt(state, square) !== null || playerAt(state, square) !== null;
  return [from, ...attackedSquares(nextPiece(player), player.colour, from, isBlocked)];
}

/** True when a square outside the hit squares and known danger is reachable within a few steps, which the fuse allows. */
function hasEscape(state, player, hitSquares, danger, from = player.square) {
  const seen = new Set([from]);
  let frontier = [from];
  for (let depth = 0; depth < ESCAPE_STEPS; depth += 1) {
    const next = [];
    for (const square of frontier) {
      for (const neighbour of neighbours(square)) {
        if (seen.has(neighbour) || danger[neighbour] || !canMoveTo(state, player, neighbour)) continue;
        if (!hitSquares.includes(neighbour)) return true;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return false;
}

/** True when the piece the bot would drop next, dropped on a square, hits a wanted square and leaves the bot a square to step clear to. */
function dropWorksFrom(state, player, danger, wantsHit, from) {
  const hitSquares = dropSquares(state, player, from);
  return hitSquares.some(wantsHit) && hasEscape(state, player, hitSquares, danger, from);
}

/** True when dropping right here hits a wanted square and the bot can still step clear. */
function shouldDrop(state, player, danger, wantsHit) {
  return canDrop(state, player) && dropWorksFrom(state, player, danger, wantsHit, player.square);
}

/** A fair opponent: it thinks once per square, needs a moment to react to a new enemy piece, never ignores danger it knows about, and misses half its kill chances. Between thoughts it keeps walking. */
export function createBot(colour, seed) {
  const random = createRandom(seed);
  let lastMove = null;
  let lastThinkTick = -THINK_EVERY_TICKS;
  function remember(decision) {
    lastMove = decision.move;
    return decision;
  }
  return function decide(state) {
    const player = state.players[colour];
    const enemy = state.players[colour === "white" ? "black" : "white"];
    if (!player.alive) return { move: null, drop: false };
    const betweenSquares = player.x % STEPS_PER_SQUARE !== 0 || player.y % STEPS_PER_SQUARE !== 0;
    if ((betweenSquares && lastMove) || state.tick - lastThinkTick < THINK_EVERY_TICKS) return { move: lastMove, drop: false };
    lastThinkTick = state.tick;
    const danger = dangerMap(state, colour);
    const steps = shuffledSteps(random);

    if (danger[player.square]) {
      const isSafe = (square) => !danger[square];
      const cleanEscape = firstStepToward(state, player, isSafe, danger, steps);
      const riskyEscape = cleanEscape || firstStepToward(state, player, isSafe, dangerMap(state, colour, true), steps);
      return remember({ move: riskyEscape, drop: false });
    }

    if (enemy.alive && random() < TAKE_KILL_CHANCE && shouldDrop(state, player, danger, (square) => square === enemy.square)) return remember({ move: null, drop: true });

    if (random() < DROP_CHANCE_PER_THINK) {
      const nearEnemy = (square) => enemy.alive && chebyshevDistance(square, enemy.square) <= 1;
      const isRubble = (square) => state.blocks[square] === 1;
      if (shouldDrop(state, player, danger, nearEnemy) || shouldDrop(state, player, danger, isRubble)) return remember({ move: null, drop: true });
    }

    const hitsEnemyFrom = (square) => enemy.alive && dropWorksFrom(state, player, danger, (hit) => hit === enemy.square, square);
    const isTarget = (square) => state.pickups[square] !== null || hitsEnemyFrom(square);
    const towardTarget = firstStepToward(state, player, isTarget, danger, steps);
    if (towardTarget) return remember({ move: towardTarget, drop: false });

    const diggingRoute = enemy.alive ? pathToward(state, player, hitsEnemyFrom, danger, steps, true) : null;
    const rubbleAhead = diggingRoute ? diggingRoute.find((square) => state.blocks[square] === 1) : undefined;
    if (rubbleAhead !== undefined) {
      if (shouldDrop(state, player, danger, (square) => square === rubbleAhead)) return remember({ move: null, drop: true });
      const hitsRubbleFrom = (square) => dropWorksFrom(state, player, danger, (hit) => hit === rubbleAhead, square);
      const towardRubble = firstStepToward(state, player, hitsRubbleFrom, danger, steps);
      if (towardRubble) return remember({ move: towardRubble, drop: false });
    }
    const safeStep = steps.find(([rowDelta, columnDelta]) => {
      const target = stepFrom(player.square, rowDelta, columnDelta);
      return target >= 0 && !danger[target] && canMoveTo(state, player, target);
    });
    return remember({ move: safeStep || null, drop: false });
  };
}
