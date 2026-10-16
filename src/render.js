import { GLYPHS, SQUARES, squareName } from "./chess.js";
import { COLOURS, DROP_ORDER, FUSE_TICKS, STEPS_PER_SQUARE, TICKS_PER_SECOND, nextPiece, pieceAt, playerAt } from "./game.js";

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

  /** Kings are overlays placed by their walking position, in squares. A king on a fused piece gets an orange ring, a dead one topples. */
  function renderKing(state, colour) {
    const player = state.players[colour];
    const king = kings[colour];
    const column = player.x / STEPS_PER_SQUARE;
    const row = player.y / STEPS_PER_SQUARE;
    let transform = `translate(${(column * 100).toFixed(2)}%, ${(row * 100).toFixed(2)}%)`;
    if (!player.alive) transform += " rotate(90deg)";
    king.style.transform = transform;
    king.classList.toggle("teleport", state.tick === 0);
    king.classList.toggle("dead", !player.alive);
    king.classList.toggle("armed", player.alive && pieceAt(state, player.square) !== null);
  }

  return function renderBoard(state) {
    for (let square = 0; square < SQUARES; square += 1) {
      const cell = cells[square];
      const piece = pieceAt(state, square);
      const pickup = state.pickups[square];
      const key = `${pickup || ""}|${piece ? piece.id : ""}`;
      if (cell.dataset.key !== key) {
        let content = "";
        if (pickup) content += `<span class="pickup" aria-hidden="true"><span class="pickup-tag">+${GLYPHS.white[pickup]}</span></span>`;
        if (piece) content += `<span class="piece ${piece.colour}" aria-hidden="true"><span class="bomb">${GLYPHS[piece.colour][piece.type]}</span></span>`;
        cell.innerHTML = content;
        cell.dataset.key = key;
      }
      if (piece) cell.querySelector(".piece").style.setProperty("--fuse", Math.max(0, piece.fuse / FUSE_TICKS).toFixed(2));
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

/** Shows a player's pieces, best first, marks the one the next drop uses and spells it out in the next drop line. */
export function createInventoryView(container, nextDropElement, colour) {
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
    const nextText = `Drops ${GLYPHS[colour][next]} ${PIECE_LABELS[next]} next`;
    if (nextDropElement.textContent !== nextText) nextDropElement.textContent = nextText;
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
