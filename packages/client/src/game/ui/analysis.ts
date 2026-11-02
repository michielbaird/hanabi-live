// Post-game analysis by the bot: lists every move of a finished game that the bot would have played
// differently. The bot (hanab-bot-rs) is compiled to WebAssembly and runs in a Web Worker
// ("public/js/analysis-worker.js"), so nothing is sent to the server except the usual request for
// the game's "/export/<id>" data.

import Konva from "konva";
import * as replay from "./replay";
import { getReplayButtonRow } from "./replayButtonRow";
import { globals } from "./UIGlobals";

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

/** The small box next to the button where the convention is chosen. */
let panel: HTMLDivElement | null = null;
/** The progress bar in the middle of the screen while the bot goes through the game. */
let progress: HTMLDivElement | null = null;
let worker: Worker | null = null;
let poll: number | null = null;

/** The finished analysis of the game being viewed, shown on the replay controls. */
let result: AnalysisResult | null = null;
/** What the convention of the analysis was called in the picker. */
let resultConvention = "";
let markers: Konva.Group | null = null;
let commentText: Konva.Text | null = null;

const MISTAKE_COLOR = "#ff4040";
const SUGGESTION_COLOR = "#ffb000";
const SUMMARY_COLOR = "#58a6ff";

const STORAGE_KEY = "botAnalysis";

/**
 * Whether the user turned the bot analysis on in the settings. It is a client-only setting (kept in
 * localStorage, like the dark mode), and off by default.
 */
export function isEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // localStorage may be unavailable (e.g. private browsing, disabled).
    return false;
  }
}

/** Called on page load to wire up the checkbox in the settings. */
export function initSettings(): void {
  const checkbox = document.querySelector<HTMLInputElement>("#botAnalysis");
  if (checkbox === null) {
    return;
  }

  checkbox.checked = isEnabled();
  checkbox.addEventListener("change", () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(checkbox.checked));
    } catch {
      // The localStorage API may be unavailable.
    }

    if (!checkbox.checked) {
      clear();
    }
  });
}

/** Removes everything that the analysis added to the screen. */
function clear() {
  stopWorker();
  panel?.remove();
  panel = null;
  dismissProgress();
  result = null;
  const hadOverlay = markers !== null || commentText !== null;
  markers?.destroy();
  markers = null;
  commentText?.destroy();
  commentText = null;
  layoutButtons(null);
  if (hadOverlay) {
    globals.layers.UI.batchDraw();
  }
}

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
  panel?.remove();
  panel = null;
  dismissProgress();
  result = null;
  markers?.destroy();
  markers = null;
  commentText?.destroy();
  commentText = null;
}

/**
 * The replay segment to show a comment at. Segment 0 is the start of the game, so the position just
 * before the bot's "turn N" is N - 1: the board as the player saw it, about to make the move.
 */
function getSegment(comment: AnalysisComment): number {
  return comment.turn - 1;
}

/**
 * Redraws what the analysis adds to the replay: a marker on the replay bar for every move the bot
 * would have played differently, buttons to jump between them, and the bot's comment on the turn
 * being shown. Called when the analysis finishes, whenever the replay moves, and when the UI is
 * rebuilt.
 */
export function refresh(): void {
  if (result === null) {
    return;
  }

  layoutButtons(result);
  drawMarkers(result);
  drawComment(result);
  globals.layers.UI.batchDraw();
}

/**
 * The replay segments that the buttons to jump between the bot's comments stop at: the turns it has
 * a comment on, and the end of the game, where the summary is.
 */
function getStops(analysis: AnalysisResult): readonly number[] {
  const stops = analysis.comments.map(getSegment);
  const finalSegment = globals.state.ongoingGame.turn.segment;
  if (finalSegment !== null) {
    stops.push(finalSegment);
  }
  return stops;
}

/** Goes to the next (or previous) turn that the bot has a comment on, or to the summary. */
export function goToFlagged(direction: -1 | 1): void {
  if (result === null) {
    return;
  }

  const current = globals.state.replay.segment;
  const segments = getStops(result).filter((segment) =>
    direction > 0 ? segment > current : segment < current,
  );
  if (segments.length === 0) {
    return;
  }

  replay.goToSegment(
    direction > 0 ? Math.min(...segments) : Math.max(...segments),
    true,
  );
}

/**
 * With an analysis, the replay controls get two more buttons, between "previous" and "first" and
 * between "next" and "last", and the row is tightened to fit them.
 */
function layoutButtons(analysis: AnalysisResult | null) {
  const {
    replayBackFullButton,
    replayBackButton,
    replayForwardButton,
    replayForwardFullButton,
    replayBackAnalysisButton,
    replayForwardAnalysisButton,
  } = globals.elements;
  if (
    replayBackFullButton === null
    || replayBackButton === null
    || replayForwardButton === null
    || replayForwardFullButton === null
    || replayBackAnalysisButton === null
    || replayForwardAnalysisButton === null
  ) {
    return;
  }

  const withButtons = analysis !== null && analysis.comments.length > 0;
  const row = getReplayButtonRow(
    globals.lobby.settings.keldonMode,
    withButtons,
  );
  const buttons = withButtons
    ? [
        replayBackFullButton,
        replayBackAnalysisButton,
        replayBackButton,
        replayForwardButton,
        replayForwardAnalysisButton,
        replayForwardFullButton,
      ]
    : [
        replayBackFullButton,
        replayBackButton,
        replayForwardButton,
        replayForwardFullButton,
      ];
  let { x } = row;
  for (const replayButton of buttons) {
    replayButton.x(x * globals.stage.width());
    x += row.buttonWidth + row.spacing;
  }

  replayBackAnalysisButton.visible(withButtons);
  replayForwardAnalysisButton.visible(withButtons);
  if (withButtons) {
    const segments = getStops(analysis);
    const current = globals.state.replay.segment;
    replayBackAnalysisButton.setEnabled(segments.some((s) => s < current));
    replayForwardAnalysisButton.setEnabled(segments.some((s) => s > current));
  }
}

function drawMarkers(analysis: AnalysisResult) {
  const { replayArea, replayBar, replayShuttle } = globals.elements;
  if (replayArea === null || replayBar === null || replayShuttle === null) {
    return;
  }

  // The UI is rebuilt when the window is resized, which discards the old replay area.
  markers?.destroy();
  markers = new Konva.Group({ listening: false });
  replayArea.add(markers);
  // Behind the shuttles, which are added to the replay area after the bar and its click area.
  markers.zIndex(2);

  // The same geometry as the shuttle's (see "positionReplayShuttle()" in "replay.ts").
  const finalSegment = Math.max(globals.state.ongoingGame.turn.segment ?? 1, 1);
  const sliderWidth = replayBar.width() - replayShuttle.width();
  const markerWidth = replayBar.height() * 0.9;
  const markerHeight = replayBar.height() * 1.8;

  // Mistakes last, so that they are on top if a suggestion is on the same turn.
  const ordered = analysis.comments.toSorted(
    (a, b) => Number(a.mistake) - Number(b.mistake),
  );
  for (const comment of ordered) {
    const x =
      replayBar.x()
      + (sliderWidth / finalSegment) * getSegment(comment)
      + replayShuttle.width() / 2;
    markers.add(
      new Konva.Rect({
        x: x - markerWidth / 2,
        y: replayBar.y() - markerHeight - 1,
        width: markerWidth,
        height: markerHeight,
        fill: comment.mistake ? MISTAKE_COLOR : SUGGESTION_COLOR,
        cornerRadius: markerWidth / 3,
        listening: false,
      }),
    );
  }

  // The summary of the whole analysis is shown at the end of the game.
  markers.add(
    new Konva.Rect({
      x:
        replayBar.x()
        + sliderWidth
        + replayShuttle.width() / 2
        - markerWidth / 2,
      y: replayBar.y() - markerHeight - 1,
      width: markerWidth,
      height: markerHeight,
      fill: SUMMARY_COLOR,
      cornerRadius: markerWidth / 3,
      listening: false,
    }),
  );
}

/**
 * Shows the bot's comment for the turn being shown in the replay, if there is one, under the
 * buttons that are below the replay controls ("Enter Hypothetical" and so on). At the end of the
 * game it shows a summary of the whole analysis instead.
 */
function drawComment(analysis: AnalysisResult) {
  commentText?.destroy();
  commentText = null;

  const { replayArea } = globals.elements;
  if (replayArea === null) {
    return;
  }

  const here = analysis.comments.filter(
    (c) => getSegment(c) === globals.state.replay.segment,
  );
  let text: string;
  let mistake: boolean;
  if (here.length > 0) {
    text = here
      .map((c) => `${analysis.players[c.player] ?? "?"}: ${c.text}`)
      .join("\n");
    mistake = here.some((c) => c.mistake);
  } else if (
    globals.state.replay.segment === globals.state.ongoingGame.turn.segment
  ) {
    text = getSummary(analysis);
    mistake = false;
  } else {
    return;
  }

  const winH = globals.stage.height();
  commentText = new Konva.Text({
    x: 0,
    y: 0.24 * winH,
    width: replayArea.width(),
    text,
    fontSize: 0.02 * winH,
    fontFamily: "Verdana",
    fill: mistake ? "#ff8080" : "white",
    align: "center",
    listening: false,
  });
  replayArea.add(commentText);
}

/** What is said about the whole game, which is shown at its end. */
function getSummary(analysis: AnalysisResult): string {
  const total = analysis.comments.length;
  const mistakes = analysis.comments.filter((c) => c.mistake).length;
  const label = `Bot analysis (${resultConvention})`;
  if (total === 0) {
    return `${label}: the bot would not have played any move differently.`;
  }

  const moves = total === 1 ? "1 move differs" : `${total} moves differ`;
  const clearMistakes =
    mistakes === 1
      ? "1 clearMistakes mistake"
      : `${mistakes} clearMistakes mistakes`;
  return `${label}: ${moves} from what the bot would do, ${clearMistakes}.`;
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

/**
 * Shows or hides the "Bot analysis" button in the replay controls (see "drawReplayArea.ts"):
 * it is for finished games, when the setting is on.
 */
export function updateButton(): void {
  const { analysisButton } = globals.elements;
  if (analysisButton === null) {
    return;
  }

  const visible = isEnabled() && getDatabaseID() !== null;
  if (analysisButton.visible() === visible) {
    return;
  }

  analysisButton.visible(visible);
  if (!visible) {
    panel?.remove();
    panel = null;
    stopWorker();
  }
  globals.layers.UI.batchDraw();
}

/** Opens (or closes) the small box next to the button where the convention is chosen. */
export function togglePanel(): void {
  if (panel !== null) {
    panel.remove();
    panel = null;
    return;
  }

  const { analysisButton } = globals.elements;
  if (analysisButton === null) {
    return;
  }

  const picker = document.createElement("select");
  for (const [value, label] of conventionOptions) {
    picker.append(new Option(label, value));
  }
  const start = document.createElement("button");
  start.textContent = "Analyze";
  start.addEventListener("click", () => {
    const label = picker.selectedOptions[0]?.textContent ?? picker.value;
    panel?.remove();
    panel = null;
    run(picker.value, label).catch((error: unknown) => {
      showProgressError(String(error));
    });
  });

  panel = document.createElement("div");
  panel.id = "bot-analysis-panel";
  Object.assign(panel.style, {
    position: "fixed",
    zIndex: "100",
    padding: "0.6em 0.8em",
    background: "rgba(0, 0, 0, 0.88)",
    color: "white",
    borderRadius: "6px",
    fontSize: "0.9em",
    whiteSpace: "nowrap",
  });
  panel.append("Bot analysis: ", picker, " ", start);
  document.querySelector("#game")?.append(panel);

  // Next to the button, which is drawn on the canvas, or on its other side if there is no room.
  const canvas = globals.stage.container().getBoundingClientRect();
  const position = analysisButton.getAbsolutePosition();
  const gap = 6;
  const right = canvas.left + position.x + analysisButton.width() + gap;
  const { width } = panel.getBoundingClientRect();
  panel.style.top = `${canvas.top + position.y}px`;
  panel.style.left = `${
    right + width <= globalThis.innerWidth
      ? right
      : Math.max(canvas.left + position.x - width - gap, 0)
  }px`;
}

function stopWorker() {
  worker?.terminate();
  worker = null;
}

// ------------------------------------------
// The progress bar in the middle of the screen
// ------------------------------------------

function showProgress(): { text: HTMLElement; bar: HTMLProgressElement } {
  dismissProgress();

  const text = document.createElement("div");
  text.style.marginBottom = "0.5em";
  const bar = document.createElement("progress");
  bar.style.width = "20em";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.style.marginTop = "0.6em";
  cancel.addEventListener("click", () => {
    stopWorker();
    dismissProgress();
  });

  progress = document.createElement("div");
  progress.id = "bot-analysis-progress";
  Object.assign(progress.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: "100",
    padding: "1em 1.5em",
    background: "rgba(0, 0, 0, 0.88)",
    color: "white",
    borderRadius: "6px",
    textAlign: "center",
  });
  const buttons = document.createElement("div");
  buttons.append(cancel);
  progress.append(text, bar, buttons);
  document.querySelector("#game")?.append(progress);
  return { text, bar };
}

function dismissProgress() {
  progress?.remove();
  progress = null;
}

/** An error stays on the screen for a few seconds, or until it is clicked. */
function showProgressError(message: string) {
  stopWorker();
  const { text, bar } = showProgress();
  bar.remove();
  progress?.querySelector("button")?.remove();
  text.style.color = "#ff8080";
  text.textContent = `The analysis failed: ${message}`;
  const element = progress;
  element?.addEventListener("click", dismissProgress);
  globalThis.setTimeout(() => {
    if (progress === element) {
      dismissProgress();
    }
  }, 8000);
}

async function run(convention: string, conventionLabel: string) {
  const databaseID = getDatabaseID();
  if (databaseID === null) {
    showProgressError("This game can not be analyzed.");
    return;
  }

  const { text, bar } = showProgress();
  try {
    text.textContent = "Loading the game...";
    const response = await fetch(`/export/${databaseID}`);
    if (!response.ok) {
      throw new Error(`The server could not export game ${databaseID}.`);
    }
    const exportJson = await response.text();

    const analysis = await new Promise<AnalysisResult>((resolve, reject) => {
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
            text.textContent = `Bot analysis: move ${message.done} of ${message.total}`;
            bar.max = message.total;
            bar.value = message.done;
          } else if (message.type === "result") {
            resolve(message.result);
          } else {
            reject(new Error(message.message));
          }
        },
      );
      text.textContent = "Bot analysis: starting...";
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
    result = analysis;
    resultConvention = conventionLabel;
    dismissProgress();
    refresh();
  } catch (error) {
    // A cancelled analysis has already dismissed its progress bar and ended its worker.
    if (progress !== null) {
      showProgressError(error instanceof Error ? error.message : String(error));
    }
  }
}
