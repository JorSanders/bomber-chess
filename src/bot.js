import { KING_STEPS, SQUARES, attackedSquares, stepFrom } from "./chess.js";
import { canDrop, canMoveTo, createRandom, neighbours, nextPiece, pieceAt, playerAt, threatenedSquares } from "./game.js";

const DROP_CHANCE_PER_TICK = 0.08;

function dangerMap(state) {
  const danger = threatenedSquares(state);
  for (let square = 0; square < SQUARES; square += 1) {
    if (state.blasts[square] > 0) danger[square] = 1;
  }
  return danger;
}

function shuffledSteps(random) {
  const steps = KING_STEPS.slice();
  for (let index = steps.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [steps[index], steps[other]] = [steps[other], steps[index]];
  }
  return steps;
}

/** Breadth first search from the bot's square over squares it can walk on. Returns the first step toward the nearest square that satisfies isGoal. The step order is shuffled so the bot has no favourite direction. */
function firstStepToward(state, player, isGoal, avoid, steps) {
  const cameFrom = new Map([[player.square, null]]);
  const queue = [player.square];
  while (queue.length > 0) {
    const square = queue.shift();
    if (square !== player.square && isGoal(square)) {
      let step = square;
      while (cameFrom.get(step) !== player.square) step = cameFrom.get(step);
      return directionBetween(player.square, step);
    }
    for (const [rowDelta, columnDelta] of steps) {
      const next = stepFrom(square, rowDelta, columnDelta);
      if (next < 0 || cameFrom.has(next) || avoid[next] || !canMoveTo(state, player, next)) continue;
      cameFrom.set(next, square);
      queue.push(next);
    }
  }
  return null;
}

function directionBetween(from, to) {
  for (const [rowDelta, columnDelta] of KING_STEPS) {
    if (stepFrom(from, rowDelta, columnDelta) === to) return [rowDelta, columnDelta];
  }
  return null;
}

function chebyshevDistance(a, b) {
  return Math.max(Math.abs(Math.floor(a / 8) - Math.floor(b / 8)), Math.abs((a % 8) - (b % 8)));
}

function dropSquares(state, player) {
  const isBlocked = (square) => state.blocks[square] === 1 || pieceAt(state, square) !== null || playerAt(state, square) !== null;
  return [player.square, ...attackedSquares(nextPiece(player), player.colour, player.square, isBlocked)];
}

function hasEscape(state, player, hitSquares, danger) {
  return neighbours(player.square).some((square) => canMoveTo(state, player, square) && !hitSquares.includes(square) && !danger[square]);
}

/** True when the piece the bot would drop next hits a wanted square from where it stands, and the bot can still step clear. */
function shouldDrop(state, player, danger, wantsHit) {
  if (!canDrop(state, player)) return false;
  const hitSquares = dropSquares(state, player);
  return hitSquares.some(wantsHit) && hasEscape(state, player, hitSquares, danger);
}

/** A simple opponent: step out of danger, drop a piece that hits the enemy king or rubble, otherwise walk toward the enemy. */
export function createBot(colour, seed) {
  const random = createRandom(seed);
  return function decide(state) {
    const player = state.players[colour];
    const enemy = state.players[colour === "white" ? "black" : "white"];
    if (!player.alive) return { move: null, drop: false };
    const danger = dangerMap(state);
    const steps = shuffledSteps(random);

    if (danger[player.square]) {
      return { move: firstStepToward(state, player, (square) => !danger[square], new Uint8Array(SQUARES), steps), drop: false };
    }

    if (enemy.alive && shouldDrop(state, player, danger, (square) => square === enemy.square)) return { move: null, drop: true };

    if (random() < DROP_CHANCE_PER_TICK) {
      const nearEnemy = (square) => enemy.alive && chebyshevDistance(square, enemy.square) <= 1;
      const isRubble = (square) => state.blocks[square] === 1;
      if (shouldDrop(state, player, danger, nearEnemy) || shouldDrop(state, player, danger, isRubble)) return { move: null, drop: true };
    }

    if (player.cooldown > 0) return { move: null, drop: false };
    const isTarget = (square) => state.pickups[square] !== null || (enemy.alive && chebyshevDistance(square, enemy.square) <= 2);
    const towardTarget = firstStepToward(state, player, isTarget, danger, steps);
    if (towardTarget) return { move: towardTarget, drop: false };
    const safeStep = steps.find(([rowDelta, columnDelta]) => {
      const target = stepFrom(player.square, rowDelta, columnDelta);
      return target >= 0 && !danger[target] && canMoveTo(state, player, target);
    });
    return { move: safeStep || null, drop: false };
  };
}
