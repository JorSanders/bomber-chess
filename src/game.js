import { KING_STEPS, SQUARES, attackedSquares, columnOf, rowOf, squareIndex, stepFrom } from "./chess.js";

export const TICKS_PER_SECOND = 10;
export const ROUND_SECONDS = 120;
export const MOVE_COOLDOWN_TICKS = 3;
export const FUSE_TICKS = 15;
export const BLAST_TICKS = 4;
export const COLOURS = ["white", "black"];
export const DROP_ORDER = ["queen", "rook", "bishop", "knight", "pawn"];

const BLOCK_CHANCE = 0.45;
const PICKUP_CHANCE = 0.5;
const PICKUP_WEIGHTS = [["knight", 4], ["bishop", 3], ["rook", 2], ["queen", 1]];
const START_SQUARES = { white: squareIndex(7, 0), black: squareIndex(0, 7) };

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
    players[colour] = {
      colour,
      square: START_SQUARES[colour],
      alive: true,
      cooldown: 0,
      inventory: { knight: 1, bishop: 0, rook: 0, queen: 0 },
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

/** The piece a player drops next: the best one in the inventory, and a pawn when it is empty. */
export function nextPiece(player) {
  return DROP_ORDER.find((type) => type === "pawn" || player.inventory[type] > 0);
}

export function canDrop(state, player) {
  return player.alive && pieceAt(state, player.square) === null;
}

export function canMoveTo(state, player, square) {
  if (square < 0 || state.blocks[square] || pieceAt(state, square)) return false;
  const other = playerAt(state, square);
  return other === null || other === player;
}

function dropPiece(state, player) {
  if (!canDrop(state, player)) return;
  const type = nextPiece(player);
  if (type !== "pawn") player.inventory[type] -= 1;
  state.pieces.push({ id: state.nextPieceId, type, colour: player.colour, square: player.square, fuse: FUSE_TICKS });
  state.nextPieceId += 1;
}

function movePlayer(state, player, direction) {
  if (player.cooldown > 0 || !direction) return;
  const target = stepFrom(player.square, direction[0], direction[1]);
  if (!canMoveTo(state, player, target)) return;
  player.square = target;
  player.cooldown = MOVE_COOLDOWN_TICKS;
  const pickup = state.pickups[target];
  if (pickup) {
    player.inventory[pickup] += 1;
    state.pickups[target] = null;
  }
}

function rollPickup(state) {
  if (state.random() >= PICKUP_CHANCE) return null;
  const total = PICKUP_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = state.random() * total;
  for (const [type, weight] of PICKUP_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return type;
  }
  return PICKUP_WEIGHTS[PICKUP_WEIGHTS.length - 1][0];
}

/** The squares a dropped piece would hit right now. Rubble, other pieces and kings stop sliding pieces. */
export function blastSquares(state, piece) {
  const isBlocked = (square) => state.blocks[square] === 1 || pieceAt(state, square) !== null || playerAt(state, square) !== null;
  return attackedSquares(piece.type, piece.colour, piece.square, isBlocked);
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
      } else if (state.pickups[square]) {
        state.pickups[square] = null;
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
    if (player.cooldown > 0) player.cooldown -= 1;
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
  return KING_STEPS.map(([rowDelta, columnDelta]) => stepFrom(square, rowDelta, columnDelta)).filter((target) => target >= 0);
}
