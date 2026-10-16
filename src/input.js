import { PIECE_TYPES } from "./chess.js";
import { COLOURS } from "./game.js";

const KEY_BINDINGS = {
  white: {
    moves: { KeyW: [-1, 0], KeyS: [1, 0], KeyA: [0, -1], KeyD: [0, 1] },
    drop: "Space",
    previous: "KeyQ",
    next: "KeyE",
    select: { Digit1: "pawn", Digit2: "knight", Digit3: "bishop", Digit4: "rook", Digit5: "queen" },
  },
  black: {
    moves: { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] },
    drop: "Enter",
    previous: "Comma",
    next: "Period",
    select: {},
  },
};

const HANDLED_CODES = new Set(
  COLOURS.flatMap((colour) => {
    const bindings = KEY_BINDINGS[colour];
    return [...Object.keys(bindings.moves), bindings.drop, bindings.previous, bindings.next, ...Object.keys(bindings.select)];
  }),
);

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

/** Collects keyboard and touch input per player. Movement is held, drops are queued until the next tick consumes them. */
export function createInput() {
  const pressed = new Set();
  const heldTouchDirection = { white: null, black: null };
  const queuedTaps = { white: null, black: null };
  const queuedDrops = { white: null, black: null };
  const selection = { white: "pawn", black: "pawn" };
  const selectionListeners = [];
  let available = () => true;

  function notifySelection(colour) {
    for (const listener of selectionListeners) listener(colour, selection[colour]);
  }

  function cycleSelection(colour, offset) {
    const current = PIECE_TYPES.indexOf(selection[colour]);
    const count = PIECE_TYPES.length;
    for (let attempt = 1; attempt <= count; attempt += 1) {
      const candidate = PIECE_TYPES[(((current + offset * attempt) % count) + count) % count];
      if (available(colour, candidate)) {
        selection[colour] = candidate;
        notifySelection(colour);
        return;
      }
    }
  }

  function select(colour, type) {
    if (!PIECE_TYPES.includes(type)) return;
    selection[colour] = type;
    notifySelection(colour);
  }

  function queueDrop(colour, type) {
    queuedDrops[colour] = type || selection[colour];
  }

  function onKeyDown(event) {
    if (!HANDLED_CODES.has(event.code) || event.target.closest("input, textarea, select, button")) return;
    event.preventDefault();
    if (event.repeat) return;
    pressed.add(event.code);
    for (const colour of COLOURS) {
      const bindings = KEY_BINDINGS[colour];
      if (event.code === bindings.drop) queueDrop(colour);
      if (event.code === bindings.previous) cycleSelection(colour, -1);
      if (event.code === bindings.next) cycleSelection(colour, 1);
      if (bindings.select[event.code]) select(colour, bindings.select[event.code]);
    }
  }

  function onKeyUp(event) {
    pressed.delete(event.code);
  }

  function releaseAll() {
    pressed.clear();
    for (const colour of COLOURS) heldTouchDirection[colour] = null;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);

  function heldDirection(colour) {
    if (heldTouchDirection[colour]) return heldTouchDirection[colour];
    let rowDelta = 0;
    let columnDelta = 0;
    for (const [code, [row, column]] of Object.entries(KEY_BINDINGS[colour].moves)) {
      if (!pressed.has(code)) continue;
      rowDelta += row;
      columnDelta += column;
    }
    rowDelta = clamp(rowDelta);
    columnDelta = clamp(columnDelta);
    return rowDelta === 0 && columnDelta === 0 ? null : [rowDelta, columnDelta];
  }

  return {
    selection,
    /** Called once per tick for a player: the held direction and the queued drop, which is cleared. */
    consume(colour) {
      const input = { move: heldDirection(colour) || queuedTaps[colour], drop: queuedDrops[colour] };
      queuedTaps[colour] = null;
      queuedDrops[colour] = null;
      return input;
    },
    /** A touch press holds a direction until released; a short tap still moves one square. */
    holdDirection(colour, direction) {
      heldTouchDirection[colour] = direction;
      if (direction) queuedTaps[colour] = direction;
    },
    queueDrop,
    select,
    onSelectionChange(listener) {
      selectionListeners.push(listener);
    },
    /** Tells the input which piece types a player can currently select, so cycling skips empty slots. */
    setAvailability(check) {
      available = check;
    },
    reset() {
      releaseAll();
      for (const colour of COLOURS) {
        queuedTaps[colour] = null;
        queuedDrops[colour] = null;
        selection[colour] = "pawn";
        notifySelection(colour);
      }
    },
  };
}

export const KEY_HELP = {
  white: "WASD moves, Space drops the selected piece, Q and E or 1 to 5 pick a piece",
  black: "Arrow keys move, Enter drops the selected piece, comma and period pick a piece",
};
