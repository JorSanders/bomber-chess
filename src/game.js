import { SIZE, SQUARES, WALK_STEPS, attackedSquares, columnOf, onBoard, rowOf, squareIndex, stepFrom } from "./chess.js";

export const TICKS_PER_SECOND = 20;
export const ROUND_SECONDS = 120;
export const STEPS_PER_SQUARE = 6;
export const FUSE_TICKS = 50;
export const BLAST_TICKS = 4;
export const COLOURS = ["white", "black"];
export const DROP_ORDER = ["queen", "rook", "bishop", "knight", "pawn"];

const BLOCK_CHANCE = 0.45;
const PICKUP_CHANCE = 0.5;
const PICKUP_WEIGHTS = [["knight", 4], ["bishop", 3], ["rook", 2], ["queen", 1]];
const START_SQUARES = { white: squareIndex(7, 0), black: squareIndex(0, 7) };
const MAX_POSITION = (SIZE - 1) * STEPS_PER_SQUARE;

/** A small seeded random generator (mulberry32), so a seed gives the same game on every device. */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function nearStart(square) {
  return COLOURS.some((colour) => {
    const start = START_SQUARES[colour];
    return Math.abs(rowOf(square) - rowOf(start)) <= 1 && Math.abs(columnOf(square) - columnOf(start)) <= 1;
  });
}

export function createGame(seed) {
  const random = createRandom(seed);
  const blocks = new Uint8Array(SQUARES);
  for (let square = 0; square < SQUARES; square += 1) {
    if (!nearStart(square) && random() < BLOCK_CHANCE) blocks[square] = 1;
  }
  const players = {};
  for (const colour of COLOURS) {
    const start = START_SQUARES[colour];
    players[colour] = {
      colour,
      x: columnOf(start) * STEPS_PER_SQUARE,
      y: rowOf(start) * STEPS_PER_SQUARE,
      square: start,
      alive: true,
      inventory: { knight: 1, bishop: 0, rook: 0, queen: 0 },
      active: "knight",
    };
  }
  return {
    seed,
    random,
    tick: 0,
    ticksLeft: ROUND_SECONDS * TICKS_PER_SECOND,
    over: false,
    winner: null,
    blocks,
    pickups: new Array(SQUARES).fill(null),
    pieces: [],
    nextPieceId: 1,
    queenSpawned: false,
    blasts: new Uint8Array(SQUARES),
    players,
  };
}

export function pieceAt(state, square) {
  return state.pieces.find((piece) => piece.square === square) || null;
}

export function playerAt(state, square) {
  return COLOURS.map((colour) => state.players[colour]).find((player) => player.alive && player.square === square) || null;
}

/** The piece a player drops next. It only moves on when that piece is dropped, never when pieces come back or get picked up. */
export function nextPiece(player) {
  return player.active;
}

/** After dropping a piece the active one becomes the next best piece in hand, wrapping from pawn back to the top. */
function advanceActive(player, dropped) {
  const start = DROP_ORDER.indexOf(dropped);
  for (let offset = 1; offset <= DROP_ORDER.length; offset += 1) {
    const type = DROP_ORDER[(start + offset) % DROP_ORDER.length];
    if (type === "pawn" || player.inventory[type] > 0) return type;
  }
  return "pawn";
}

export function canDrop(state, player) {
  return player.alive && pieceAt(state, player.square) === null;
}

/** The one to four squares a king covers at a position, since it can be between squares on both axes. */
function coveredSquaresAt(x, y) {
  const squares = new Set();
  for (const row of [Math.floor(y / STEPS_PER_SQUARE), Math.ceil(y / STEPS_PER_SQUARE)]) {
    for (const column of [Math.floor(x / STEPS_PER_SQUARE), Math.ceil(x / STEPS_PER_SQUARE)]) {
      squares.add(squareIndex(row, column));
    }
  }
  return [...squares];
}

/** A king can walk onto a square without rubble, and past a fused piece only while it still stands on it. Kings walk through each other. */
export function canMoveTo(state, player, square) {
  if (square < 0 || state.blocks[square]) return false;
  return pieceAt(state, square) === null || coveredSquaresAt(player.x, player.y).includes(square);
}

function dropPiece(state, player) {
  if (!canDrop(state, player)) return;
  const type = player.active;
  if (type !== "pawn") player.inventory[type] -= 1;
  player.active = advanceActive(player, type);
  state.pieces.push({ id: state.nextPieceId, type, colour: player.colour, square: player.square, fuse: FUSE_TICKS });
  state.nextPieceId += 1;
}

function clampPosition(value) {
  return Math.max(0, Math.min(MAX_POSITION, value));
}

/** Tries one step along one axis. The step is free when every square the king would then cover is walkable. When something is in the way and the king is off a lane, it nudges sideways toward an open lane instead, like Bomberman's corner help. */
function stepAlong(state, player, rowDelta, columnDelta) {
  const nextX = clampPosition(player.x + columnDelta);
  const nextY = clampPosition(player.y + rowDelta);
  if (nextX === player.x && nextY === player.y) return false;
  if (coveredSquaresAt(nextX, nextY).every((square) => canMoveTo(state, player, square))) {
    player.x = nextX;
    player.y = nextY;
    return true;
  }
  const alongRows = rowDelta !== 0;
  const across = alongRows ? player.x : player.y;
  if (across % STEPS_PER_SQUARE === 0) return false;
  const current = Math.round((alongRows ? player.y : player.x) / STEPS_PER_SQUARE);
  const nearestLane = Math.round(across / STEPS_PER_SQUARE);
  const otherLane = nearestLane === Math.floor(across / STEPS_PER_SQUARE) ? Math.ceil(across / STEPS_PER_SQUARE) : Math.floor(across / STEPS_PER_SQUARE);
  for (const lane of [nearestLane, otherLane]) {
    const aheadRow = alongRows ? current + rowDelta : lane;
    const aheadColumn = alongRows ? lane : current + columnDelta;
    if (!onBoard(aheadRow, aheadColumn) || !canMoveTo(state, player, squareIndex(aheadRow, aheadColumn))) continue;
    const nudge = Math.sign(lane * STEPS_PER_SQUARE - across);
    if (alongRows) player.x += nudge;
    else player.y += nudge;
    return true;
  }
  return false;
}

/** Walks one step per tick. Two held directions try the one the king is already moving along first, then the other. */
function movePlayer(state, player, direction) {
  if (!direction) return;
  const [rowDelta, columnDelta] = direction;
  const attempts = [];
  if (rowDelta !== 0) attempts.push([rowDelta, 0]);
  if (columnDelta !== 0) attempts.push([0, columnDelta]);
  if (attempts.length === 2 && player.x % STEPS_PER_SQUARE !== 0) attempts.reverse();
  for (const [stepRow, stepColumn] of attempts) {
    if (stepAlong(state, player, stepRow, stepColumn)) break;
  }
  player.square = squareIndex(Math.round(player.y / STEPS_PER_SQUARE), Math.round(player.x / STEPS_PER_SQUARE));
  const pickup = state.pickups[player.square];
  if (pickup) {
    player.inventory[pickup] += 1;
    state.pickups[player.square] = null;
  }
}

/** Rolls what a blown up rubble square leaves behind. Only one queen shows up per game. */
function rollPickup(state) {
  if (state.random() >= PICKUP_CHANCE) return null;
  const weights = PICKUP_WEIGHTS.filter(([type]) => type !== "queen" || !state.queenSpawned);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = state.random() * total;
  let picked = weights[weights.length - 1][0];
  for (const [type, weight] of weights) {
    roll -= weight;
    if (roll < 0) {
      picked = type;
      break;
    }
  }
  if (picked === "queen") state.queenSpawned = true;
  return picked;
}

/** The squares a dropped piece would hit right now: its own square plus everything it attacks. Rubble, other pieces and kings stop sliding pieces. */
export function blastSquares(state, piece) {
  const isBlocked = (square) => state.blocks[square] === 1 || pieceAt(state, square) !== null || playerAt(state, square) !== null;
  return [piece.square, ...attackedSquares(piece.type, piece.colour, piece.square, isBlocked)];
}

function detonate(state, firstPiece) {
  const queue = [firstPiece];
  while (queue.length > 0) {
    const piece = queue.shift();
    const index = state.pieces.indexOf(piece);
    if (index === -1) continue;
    const squares = blastSquares(state, piece);
    state.pieces.splice(index, 1);
    if (piece.type !== "pawn") state.players[piece.colour].inventory[piece.type] += 1;
    for (const square of squares) {
      state.blasts[square] = BLAST_TICKS;
      if (state.blocks[square]) {
        state.blocks[square] = 0;
        state.pickups[square] = rollPickup(state);
      }
      const chained = pieceAt(state, square);
      if (chained && !queue.includes(chained)) queue.push(chained);
    }
  }
}

function settleDeaths(state) {
  for (const colour of COLOURS) {
    const player = state.players[colour];
    if (player.alive && state.blasts[player.square] > 0) player.alive = false;
  }
  const alive = COLOURS.filter((colour) => state.players[colour].alive);
  if (alive.length === 2) return;
  state.over = true;
  state.winner = alive.length === 1 ? alive[0] : "draw";
}

/** Advances the game one tick. Inputs: { white: { move: [rowDelta, columnDelta] | null, drop: boolean }, black: ... }. */
export function step(state, inputs) {
  if (state.over) return;
  state.tick += 1;
  state.ticksLeft -= 1;
  for (let square = 0; square < SQUARES; square += 1) {
    if (state.blasts[square] > 0) state.blasts[square] -= 1;
  }
  for (const colour of COLOURS) {
    const player = state.players[colour];
    if (!player.alive) continue;
    const input = inputs[colour] || {};
    if (input.drop) dropPiece(state, player);
    movePlayer(state, player, input.move);
  }
  for (const piece of state.pieces) piece.fuse -= 1;
  for (const piece of state.pieces.filter((candidate) => candidate.fuse <= 0)) detonate(state, piece);
  settleDeaths(state);
  if (!state.over && state.ticksLeft <= 0) {
    state.over = true;
    state.winner = "draw";
  }
}

/** Every square a fused piece will hit if nothing changes, chain reactions included. */
export function threatenedSquares(state) {
  const threatened = new Uint8Array(SQUARES);
  for (const piece of state.pieces) {
    for (const square of blastSquares(state, piece)) threatened[square] = 1;
  }
  return threatened;
}

export function neighbours(square) {
  return WALK_STEPS.map(([rowDelta, columnDelta]) => stepFrom(square, rowDelta, columnDelta)).filter((target) => target >= 0);
}
