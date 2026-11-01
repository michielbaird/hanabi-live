// Post-game analysis by the bot: lists every move of a finished game that the bot would have played
// differently. The bot (hanab-bot-rs) is compiled to WebAssembly and runs in a Web Worker
// ("public/js/analysis-worker.js"), so nothing is sent to the server except the usual request for
// the game's "/export/<id>" data.

import { globals } from "./UIGlobals";
import * as replay from "./replay";

const WORKER_URL = "/public/js/analysis-worker.js";
/** The bot plays H-Group at levels 1 to 12. */
const H_GROUP_LEVELS: readonly number[] = Array.from(
  { length: 12 },
  (_, i) => i + 1,
);
const conventionOptions: ReadonlyArray<readonly [string, string]> = [
  ...H_GROUP_LEVELS.map((level): readonly [string, string] => [
    `HGroup${level}`,
    `H-Group (level ${level})`,
  ]),
  ["Reactor", "Reactor"],
  ["RefSieve", "Referential Sieve"],
];

interface AnalysisComment {
  turn: number;
  player: number;
  mistake: boolean;
  text: string;
}

interface AnalysisResult {
  players: string[];
  comments: AnalysisComment[];
}

type WorkerMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "result"; result: AnalysisResult }
  | { type: "error"; message: string };

let button: HTMLButtonElement | null = null;
let panel: HTMLDivElement | null = null;
let worker: Worker | null = null;
let poll: number | null = null;

/** Called when the game UI is created. */
export function init(): void {
  poll = globalThis.setInterval(updateButton, 1000);
}

/** Called when the game UI is destroyed. */
export function destroy(): void {
  if (poll !== null) {
    globalThis.clearInterval(poll);
    poll = null;
  }
  stopWorker();
  button?.remove();
  button = null;
  panel?.remove();
  panel = null;
}

/**
 * The analysis is for finished games that are in the database (so that "/export/<id>" has them).
 */
function getDatabaseID(): number | null {
  const state = globals.store === null ? null : globals.state;
  if (state === null || !state.finished) {
    return null;
  }
  const { databaseID } = state.replay;
  return databaseID !== null && databaseID > 0 ? databaseID : null;
}

function updateButton() {
  const visible = getDatabaseID() !== null;
  if (!visible) {
    button?.remove();
    button = null;
    return;
  }
  if (button !== null) {
    return;
  }

  button = document.createElement("button");
  button.id = "bot-analysis-button";
  button.textContent = "Bot analysis";
  button.title =
    "Have the bot look through this game and list the moves it would have played differently";
  Object.assign(button.style, {
    position: "fixed",
    top: "0.5em",
    right: "0.5em",
    zIndex: "100",
    padding: "0.3em 0.8em",
    cursor: "pointer",
  });
  button.addEventListener("click", togglePanel);
  document.querySelector("#game")?.append(button);
}

function togglePanel() {
  if (panel !== null) {
    panel.remove();
    panel = null;
    stopWorker();
    return;
  }

  panel = document.createElement("div");
  panel.id = "bot-analysis-panel";
  Object.assign(panel.style, {
    position: "fixed",
    top: "3em",
    right: "0.5em",
    width: "min(28em, 90vw)",
    maxHeight: "70vh",
    overflowY: "auto",
    zIndex: "100",
    padding: "0.8em",
    background: "rgba(0, 0, 0, 0.88)",
    color: "white",
    borderRadius: "6px",
    fontSize: "0.9em",
  });

  const picker = document.createElement("select");
  for (const [value, label] of conventionOptions) {
    picker.append(new Option(label, value));
  }
  const start = document.createElement("button");
  start.textContent = "Analyze";
  const status = document.createElement("div");
  status.style.margin = "0.6em 0";
  const list = document.createElement("div");

  const header = document.createElement("div");
  header.append("Convention: ", picker, " ", start);
  panel.append(header, status, list);
  start.addEventListener("click", () => {
    start.disabled = true;
    picker.disabled = true;
    list.replaceChildren();
    run(picker.value, status, list)
      .catch((error: unknown) => {
        status.textContent = `The analysis failed: ${String(error)}`;
      })
      .finally(() => {
        start.disabled = false;
        picker.disabled = false;
      });
  });
  document.querySelector("#game")?.append(panel);
}

function stopWorker() {
  worker?.terminate();
  worker = null;
}

async function run(convention: string, status: HTMLElement, list: HTMLElement) {
  const databaseID = getDatabaseID();
  if (databaseID === null) {
    status.textContent = "This game can not be analyzed.";
    return;
  }

  try {
    status.textContent = "Loading the game...";
    const response = await fetch(`/export/${databaseID}`);
    if (!response.ok) {
      throw new Error(`The server could not export game ${databaseID}.`);
    }
    const exportJson = await response.text();

    const result = await new Promise<AnalysisResult>((resolve, reject) => {
      stopWorker();
      worker = new Worker(WORKER_URL, { type: "module" });
      worker.addEventListener("error", () => {
        reject(new Error("The analysis stopped unexpectedly."));
      });
      worker.addEventListener(
        "message",
        (event: MessageEvent<WorkerMessage>) => {
          const message = event.data;
          if (message.type === "progress") {
            status.textContent = `Analyzing... move ${message.done} of ${message.total}`;
          } else if (message.type === "result") {
            resolve(message.result);
          } else {
            reject(new Error(message.message));
          }
        },
      );
      status.textContent = "Analyzing...";
      worker.postMessage({
        exportJson,
        variant: globals.variant.name,
        convention,
        // The browser is slower than a native bot; a search that runs out of time reads as a
        // mistake.
        endgameTimeoutMs: 2000,
      });
    });
    stopWorker();
    showResult(result, status, list);
  } catch (error) {
    stopWorker();
    status.textContent = `The analysis failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function showResult(
  result: AnalysisResult,
  status: HTMLElement,
  list: HTMLElement,
) {
  const mistakes = result.comments.filter((c) => c.mistake).length;
  status.textContent =
    result.comments.length === 0
      ? "The bot would not have played any move differently."
      : `${result.comments.length} moves differ from what the bot would do, ${mistakes} of them clear mistakes. Click one to jump to it.`;

  for (const comment of result.comments) {
    const row = document.createElement("div");
    row.textContent = `Turn ${comment.turn}, ${result.players[comment.player] ?? "?"}: ${comment.text}`;
    Object.assign(row.style, {
      cursor: "pointer",
      padding: "0.25em 0",
      borderTop: "1px solid #444",
      color: comment.mistake ? "#ff8080" : "white",
    });
    row.addEventListener("click", () => {
      // Segment 0 is the start of the game, so the position just before the bot's "turn N" is N -
      // 1.
      replay.goToSegment(comment.turn - 1, true);
    });
    list.append(row);
  }
}
