export const SIZE = 8;
export const SQUARES = SIZE * SIZE;
export const FILES = "abcdefgh";

export const PIECE_TYPES = ["pawn", "knight", "bishop", "rook", "queen"];

export const GLYPHS = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};

export const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHOGONALS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function onBoard(row, column) {
  return row >= 0 && row < SIZE && column >= 0 && column < SIZE;
}

export function squareIndex(row, column) {
  return row * SIZE + column;
}

export function rowOf(square) {
  return Math.floor(square / SIZE);
}

export function columnOf(square) {
  return square % SIZE;
}

export function squareName(square) {
  return FILES[columnOf(square)] + (SIZE - rowOf(square));
}

export function stepFrom(square, rowDelta, columnDelta) {
  const row = rowOf(square) + rowDelta;
  const column = columnOf(square) + columnDelta;
  return onBoard(row, column) ? squareIndex(row, column) : -1;
}

function stepTargets(square, steps) {
  const targets = [];
  for (const [rowDelta, columnDelta] of steps) {
    const target = stepFrom(square, rowDelta, columnDelta);
    if (target >= 0) targets.push(target);
  }
  return targets;
}

function slideTargets(square, directions, isBlocked) {
  const targets = [];
  for (const [rowDelta, columnDelta] of directions) {
    let target = stepFrom(square, rowDelta, columnDelta);
    while (target >= 0) {
      targets.push(target);
      if (isBlocked(target)) break;
      target = stepFrom(target, rowDelta, columnDelta);
    }
  }
  return targets;
}

/** The squares a piece of this type and colour attacks from a square. Sliders stop at the first blocked square, which is still attacked. */
export function attackedSquares(type, colour, square, isBlocked) {
  switch (type) {
    case "pawn": {
      const forward = colour === "white" ? -1 : 1;
      return stepTargets(square, [[forward, -1], [forward, 1]]);
    }
    case "knight":
      return stepTargets(square, KNIGHT_STEPS);
    case "king":
      return stepTargets(square, KING_STEPS);
    case "bishop":
      return slideTargets(square, DIAGONALS, isBlocked);
    case "rook":
      return slideTargets(square, ORTHOGONALS, isBlocked);
    case "queen":
      return slideTargets(square, [...DIAGONALS, ...ORTHOGONALS], isBlocked);
    default:
      throw new Error(`Unknown piece type "${type}"`);
  }
}
