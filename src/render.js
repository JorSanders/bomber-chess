import { GLYPHS, PIECE_TYPES, SQUARES, squareName } from "./chess.js";
import { COLOURS, FUSE_TICKS, TICKS_PER_SECOND, pieceAt, playerAt } from "./game.js";

const PIECE_LABELS = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen" };

function describeSquare(state, square, threatened) {
  const parts = [squareName(square)];
  if (state.blocks[square]) parts.push("rubble");
  if (state.pickups[square]) parts.push(`${PIECE_LABELS[state.pickups[square]]} to pick up`);
  const piece = pieceAt(state, square);
  if (piece) parts.push(`${piece.colour} ${PIECE_LABELS[piece.type]} fused`);
  const player = playerAt(state, square);
  if (player) parts.push(`${player.colour} king`);
  if (state.blasts[square] > 0) parts.push("blast");
  else if (threatened[square]) parts.push("threatened");
  return parts.join(", ");
}

export function createBoardView(boardElement) {
  const cells = [];
  for (let square = 0; square < SQUARES; square += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    cell.dataset.square = squareName(square);
    const row = Math.floor(square / 8);
    const column = square % 8;
    cell.classList.add((row + column) % 2 === 0 ? "light" : "dark");
    boardElement.appendChild(cell);
    cells.push(cell);
  }

  return function renderBoard(state, threatened) {
    for (let square = 0; square < SQUARES; square += 1) {
      const cell = cells[square];
      const piece = pieceAt(state, square);
      const player = playerAt(state, square);
      const deadPlayer = COLOURS.map((colour) => state.players[colour]).find((candidate) => !candidate.alive && candidate.square === square) || null;
      const pickup = state.pickups[square];
      let content = "";
      if (pickup) content += `<span class="pickup" aria-hidden="true">${GLYPHS.white[pickup]}</span>`;
      if (piece) {
        const fuse = Math.max(0, piece.fuse / FUSE_TICKS);
        content += `<span class="piece ${piece.colour}" style="--fuse: ${fuse.toFixed(2)}" aria-hidden="true">${GLYPHS[piece.colour][piece.type]}</span>`;
      }
      if (player) content += `<span class="king ${player.colour}" aria-hidden="true">${GLYPHS[player.colour].king}</span>`;
      if (deadPlayer) content += `<span class="king ${deadPlayer.colour} dead" aria-hidden="true">${GLYPHS[deadPlayer.colour].king}</span>`;
      if (content !== cell.innerHTML) cell.innerHTML = content;
      cell.classList.toggle("block", state.blocks[square] === 1);
      cell.classList.toggle("blast", state.blasts[square] > 0);
      cell.classList.toggle("threat", state.blasts[square] === 0 && threatened[square] === 1);
      cell.setAttribute("aria-label", describeSquare(state, square, threatened));
    }
  };
}

function inventoryCount(player, type) {
  return type === "pawn" ? "∞" : String(player.inventory[type]);
}

/** Builds the inventory buttons of a player; clicking one selects and drops that piece. */
export function createInventoryView(container, colour, onDrop) {
  const buttons = {};
  for (const type of PIECE_TYPES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inventory-button";
    button.dataset.type = type;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span class="glyph" aria-hidden="true">${GLYPHS[colour][type]}</span><span class="count"></span><span class="visually-hidden">${PIECE_LABELS[type]}</span>`;
    button.addEventListener("click", () => onDrop(type, button));
    container.appendChild(button);
    buttons[type] = button;
  }
  return function renderInventory(state, selectedType) {
    const player = state.players[colour];
    for (const type of PIECE_TYPES) {
      const button = buttons[type];
      const count = inventoryCount(player, type);
      const countElement = button.querySelector(".count");
      if (countElement.textContent !== count) countElement.textContent = count;
      button.disabled = type !== "pawn" && player.inventory[type] <= 0;
      button.setAttribute("aria-pressed", String(type === selectedType));
    }
  };
}

export function formatTime(ticksLeft) {
  const seconds = Math.max(0, Math.ceil(ticksLeft / TICKS_PER_SECOND));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
