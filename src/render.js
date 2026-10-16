import { GLYPHS, SQUARES, squareName } from "./chess.js";
import { COLOURS, DROP_ORDER, FUSE_TICKS, TICKS_PER_SECOND, nextPiece, pieceAt, playerAt } from "./game.js";

const PIECE_LABELS = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen" };

function describeSquare(state, square) {
  const parts = [squareName(square)];
  if (state.blocks[square]) parts.push("rubble");
  if (state.pickups[square]) parts.push(`${PIECE_LABELS[state.pickups[square]]} to pick up`);
  const piece = pieceAt(state, square);
  if (piece) parts.push(`${piece.colour} ${PIECE_LABELS[piece.type]} fused`);
  const player = playerAt(state, square);
  if (player) parts.push(`${player.colour} king`);
  if (state.blasts[square] > 0) parts.push("flames");
  return parts.join(", ");
}

export function createBoardView(boardElement) {
  const cells = [];
  const kings = {};
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
  for (const colour of COLOURS) {
    const king = document.createElement("span");
    king.className = `king ${colour}`;
    king.setAttribute("aria-hidden", "true");
    king.textContent = GLYPHS[colour].king;
    boardElement.appendChild(king);
    kings[colour] = king;
  }

  /** Kings are overlays that slide between squares, so a move reads as walking instead of a jump. */
  function renderKing(state, colour) {
    const player = state.players[colour];
    const king = kings[colour];
    const row = Math.floor(player.square / 8);
    const column = player.square % 8;
    king.style.transform = `translate(${column * 100}%, ${row * 100}%)`;
    king.classList.toggle("teleport", state.tick === 0);
    king.classList.toggle("dead", !player.alive);
    king.classList.toggle("stacked", pieceAt(state, player.square) !== null);
  }

  return function renderBoard(state) {
    for (let square = 0; square < SQUARES; square += 1) {
      const cell = cells[square];
      const piece = pieceAt(state, square);
      const pickup = state.pickups[square];
      let content = "";
      if (pickup) content += `<span class="pickup" aria-hidden="true"><span class="pickup-tag">+${GLYPHS.white[pickup]}</span></span>`;
      if (piece) {
        const fuse = Math.max(0, piece.fuse / FUSE_TICKS);
        content += `<span class="piece ${piece.colour}" style="--fuse: ${fuse.toFixed(2)}" aria-hidden="true"><span class="bomb">${GLYPHS[piece.colour][piece.type]}</span></span>`;
      }
      if (content !== cell.innerHTML) cell.innerHTML = content;
      cell.classList.toggle("block", state.blocks[square] === 1);
      cell.classList.toggle("stacked", piece !== null && playerAt(state, square) !== null);
      cell.classList.toggle("blast", state.blasts[square] > 0);
      cell.setAttribute("aria-label", describeSquare(state, square));
    }
    for (const colour of COLOURS) renderKing(state, colour);
  };
}

function inventoryCount(player, type) {
  return type === "pawn" ? "∞" : String(player.inventory[type]);
}

/** Shows a player's pieces, best first, and marks the one the next drop uses. */
export function createInventoryView(container, colour) {
  const slots = {};
  for (const type of DROP_ORDER) {
    const slot = document.createElement("span");
    slot.className = "inventory-slot";
    slot.innerHTML = `<span class="glyph" aria-hidden="true">${GLYPHS[colour][type]}</span><span class="count"></span><span class="visually-hidden">${PIECE_LABELS[type]}</span>`;
    container.appendChild(slot);
    slots[type] = slot;
  }
  return function renderInventory(state) {
    const player = state.players[colour];
    const next = nextPiece(player);
    for (const type of DROP_ORDER) {
      const slot = slots[type];
      const count = inventoryCount(player, type);
      const countElement = slot.querySelector(".count");
      if (countElement.textContent !== count) countElement.textContent = count;
      slot.classList.toggle("empty", type !== "pawn" && player.inventory[type] <= 0);
      slot.classList.toggle("next", type === next);
    }
  };
}

export function formatTime(ticksLeft) {
  const seconds = Math.max(0, Math.ceil(ticksLeft / TICKS_PER_SECOND));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
