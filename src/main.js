import { createBot } from "./bot.js";
import { COLOURS, TICKS_PER_SECOND, createGame, step } from "./game.js";
import { KEY_HELP, createInput } from "./input.js";
import { createBoardView, createInventoryView, formatTime } from "./render.js";

const TICK_MILLISECONDS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 5;

const elements = {
  board: document.getElementById("board"),
  status: document.getElementById("status"),
  timer: document.getElementById("timer"),
  newGame: document.getElementById("new-game"),
  modeInputs: Array.from(document.querySelectorAll("input[name=mode]")),
  dpad: document.getElementById("dpad"),
  keyHelp: { white: document.getElementById("keys-white"), black: document.getElementById("keys-black") },
  inventories: { white: document.getElementById("inventory-white"), black: document.getElementById("inventory-black") },
};

const parameters = new URLSearchParams(location.search);
document.documentElement.style.setProperty("--tick", `${1000 / TICKS_PER_SECOND}ms`);
const input = createInput();
const renderBoard = createBoardView(elements.board);
const renderInventory = {};
for (const colour of COLOURS) {
  renderInventory[colour] = createInventoryView(elements.inventories[colour], colour);
  elements.keyHelp[colour].textContent = KEY_HELP[colour];
}

let state = null;
let bot = null;
let lastFrameTime = null;
let accumulator = 0;
let renderedTick = -1;

function readMode() {
  const checked = elements.modeInputs.find((element) => element.checked);
  return checked ? checked.value : "bot";
}

function applyModeFromUrl() {
  const mode = parameters.get("mode");
  const preferred = mode === "bot" || mode === "two" ? mode : window.matchMedia("(pointer: coarse)").matches ? "bot" : "two";
  for (const element of elements.modeInputs) element.checked = element.value === preferred;
}

function readSeed() {
  const requested = Number(parameters.get("seed"));
  if (Number.isInteger(requested) && requested >= 0 && requested < 2 ** 32 && !state) return requested;
  return Math.floor(Math.random() * 2 ** 32);
}

function statusText() {
  if (state.over) {
    if (state.winner === "draw") return "Draw, both kings are gone or the clock ran out.";
    return `${state.winner === "white" ? "White" : "Black"} wins. Press New game for another board.`;
  }
  return readMode() === "bot" ? "You are white. Black is a bot. Blow it up before it blows you up." : "Two players on one keyboard. Last king standing wins.";
}

function startGame() {
  const seed = readSeed();
  state = createGame(seed);
  bot = readMode() === "bot" ? createBot("black", seed ^ 0x9e3779b9) : null;
  input.reset();
  accumulator = 0;
  renderedTick = -1;
  elements.status.textContent = statusText();
  document.body.dataset.mode = readMode();
  history.replaceState(null, "", `?seed=${seed}&mode=${readMode()}`);
  render(true);
}

function render(force) {
  if (!force && state.tick === renderedTick) return;
  renderedTick = state.tick;
  renderBoard(state);
  for (const colour of COLOURS) renderInventory[colour](state);
  elements.timer.textContent = formatTime(state.ticksLeft);
  if (state.over && elements.status.textContent !== statusText()) elements.status.textContent = statusText();
}

function tick() {
  const inputs = {};
  for (const colour of COLOURS) {
    inputs[colour] = bot && colour === "black" ? bot(state) : input.consume(colour);
  }
  step(state, inputs);
}

function frame(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  accumulator += now - lastFrameTime;
  lastFrameTime = now;
  accumulator = Math.min(accumulator, TICK_MILLISECONDS * MAX_TICKS_PER_FRAME);
  while (accumulator >= TICK_MILLISECONDS) {
    tick();
    accumulator -= TICK_MILLISECONDS;
  }
  render(false);
  requestAnimationFrame(frame);
}

function buildDpad() {
  for (let row = -1; row <= 1; row += 1) {
    for (let column = -1; column <= 1; column += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dpad-button";
      if (row === 0 && column === 0) {
        button.classList.add("dpad-drop");
        button.innerHTML = `<span aria-hidden="true">●</span><span class="visually-hidden">Drop your best piece</span>`;
        button.addEventListener("click", () => input.queueDrop("white"));
      } else if (row !== 0 && column !== 0) {
        elements.dpad.appendChild(document.createElement("span"));
        continue;
      } else {
        const direction = [row, column];
        const arrows = { "-1,0": "↑", "0,-1": "←", "0,1": "→", "1,0": "↓" };
        const names = { "-1,0": "up", "0,-1": "left", "0,1": "right", "1,0": "down" };
        button.innerHTML = `<span aria-hidden="true">${arrows[direction.join(",")]}</span><span class="visually-hidden">Move ${names[direction.join(",")]}</span>`;
        const hold = (event) => {
          event.preventDefault();
          input.holdDirection("white", direction);
          if (button.hasPointerCapture(event.pointerId)) return;
          button.setPointerCapture(event.pointerId);
        };
        const release = () => input.holdDirection("white", null);
        button.addEventListener("pointerdown", hold);
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
        button.addEventListener("contextmenu", (event) => event.preventDefault());
      }
      elements.dpad.appendChild(button);
    }
  }
}

elements.newGame.addEventListener("click", () => {
  elements.newGame.blur();
  startGame();
});
for (const element of elements.modeInputs) {
  element.addEventListener("change", () => {
    element.blur();
    startGame();
  });
}
document.addEventListener("visibilitychange", () => {
  lastFrameTime = null;
  accumulator = 0;
});

buildDpad();
applyModeFromUrl();
startGame();
requestAnimationFrame(frame);
