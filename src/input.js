import { COLOURS } from "./game.js";

const KEY_BINDINGS = {
  white: {
    moves: { KeyW: [-1, 0], KeyS: [1, 0], KeyA: [0, -1], KeyD: [0, 1] },
    drop: "Space",
  },
  black: {
    moves: { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] },
    drop: "Enter",
  },
};

const HANDLED_CODES = new Set(COLOURS.flatMap((colour) => [...Object.keys(KEY_BINDINGS[colour].moves), KEY_BINDINGS[colour].drop]));

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

/** Collects keyboard and touch input per player. Movement is held, drops are queued until the next tick consumes them. */
export function createInput() {
  const pressed = new Set();
  const heldTouchDirection = { white: null, black: null };
  const queuedTaps = { white: null, black: null };
  const queuedDrops = { white: false, black: false };

  function queueDrop(colour) {
    queuedDrops[colour] = true;
  }

  function onKeyDown(event) {
    if (!HANDLED_CODES.has(event.code) || event.target.closest("input, textarea, select, button")) return;
    event.preventDefault();
    if (event.repeat) return;
    pressed.add(event.code);
    for (const colour of COLOURS) {
      if (event.code === KEY_BINDINGS[colour].drop) queueDrop(colour);
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
    /** Called once per tick for a player: the held direction and whether a drop was queued, which is then cleared. */
    consume(colour) {
      const input = { move: heldDirection(colour) || queuedTaps[colour], drop: queuedDrops[colour] };
      queuedTaps[colour] = null;
      queuedDrops[colour] = false;
      return input;
    },
    /** A touch press holds a direction until released; a short tap still moves one square. */
    holdDirection(colour, direction) {
      heldTouchDirection[colour] = direction;
      if (direction) queuedTaps[colour] = direction;
    },
    queueDrop,
    reset() {
      releaseAll();
      for (const colour of COLOURS) {
        queuedTaps[colour] = null;
        queuedDrops[colour] = false;
      }
    },
  };
}

export const KEY_HELP = {
  white: "WASD moves, Space drops your best piece",
  black: "Arrow keys move, Enter drops your best piece",
};
