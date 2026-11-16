import Konva from "konva";
import { globals as lobbyGlobals } from "../../Globals.ts";
import { store } from "../../store.ts";
import { getCanvasColors } from "../../theme.ts";
import * as hypothetical from "../hypothetical.ts";
import { globals } from "./UiGlobals.ts";
import * as analysis from "./analysis.ts";
import { BGA_ACTION_LOG, THIN_STROKE_WIDTH } from "./constants.ts";
import { Button } from "./controls/Button.ts";
import { EnterHypoButton } from "./controls/EnterHypoButton.ts";
import { SharedTurnsButton } from "./controls/SharedTurnsButton.ts";
import { Shuttle } from "./controls/Shuttle.ts";
import { initKonvaTooltips } from "./konvaTooltips.ts";
import * as replay from "./replay.ts";
import { getReplayButtonRow } from "./replayButtonRow.ts";

/** Clicks on the replay buttons closer together than this are treated as accidental. */
const ACCIDENTAL_DOUBLE_CLICK_MILLISECONDS = 50;

/** Blue, for the normal replay shuttle. */
const REPLAY_SHUTTLE_COLOR = "#0000cc";

/** The row of replay buttons: back to the start, back, forward, and forward to the end. */
const NUM_REPLAY_BUTTONS = 4;

/** The replay area, in fractions of the stage. */
const REPLAY_AREA = {
  keldon: {
    x: 0.15,
    y: 0.51,
    w: 0.5,
  },
  /** In the BGA layout, the replay area lines up with the action log above it. */
  bga: {
    x: BGA_ACTION_LOG.x,
    y: 0.49,
    w: BGA_ACTION_LOG.w,
  },
  h: 0.27,
} as const;

/** The thin black bar that the replay shuttles slide on, in fractions of the stage. */
const REPLAY_BAR = {
  /** In the Keldon layout, the bar is inset by this much from both sides of the replay area. */
  keldonInsetX: 0.01,
  y: 0.0425,
  h: 0.01,
  /** In fractions of the stage height. */
  cornerRadius: 0.005,
  /**
   * The height of the invisible rectangle over the bar, which is taller than the bar so that it is
   * easier to click on.
   */
  clickH: 0.07,
} as const;

/** The replay shuttles, in fractions of the stage. */
const REPLAY_SHUTTLE = {
  w: 0.03,
  h: 0.03,
  /** In fractions of the stage width. */
  cornerRadius: 0.01,
} as const;

/** The row of replay buttons, in fractions of the stage. */
const REPLAY_BUTTON = {
  keldonX: 0.1,
  bgaX: 0.05,
  y: 0.07,
  w: 0.06,
  h: 0.08,
  spacing: 0.02,
} as const;

/** The row of wider buttons below the replay buttons, in fractions of the stage. */
const REPLAY_BOTTOM_BUTTON = {
  y: 0.17,
  h: 0.06,
  /**
   * How much wider each button is than two replay buttons and the gap between them. The left-hand
   * position sticks out by this much past the left-most replay button.
   */
  extraW: 0.04,
} as const;

export function drawReplayArea(winW: number, winH: number): void {
  const { keldonMode } = store.getState().session.settings;
  const replayAreaValues = keldonMode ? REPLAY_AREA.keldon : REPLAY_AREA.bga;

  globals.elements.replayArea = new Konva.Group({
    x: replayAreaValues.x * winW,
    y: replayAreaValues.y * winH,
    width: replayAreaValues.w * winW,
    height: REPLAY_AREA.h * winH,
    visible: false,
  });

  // The thin black rectangle that the replay slider slides on. In the Keldon layout, it is inset
  // from both sides of the replay area.
  const replayBarInset = keldonMode ? REPLAY_BAR.keldonInsetX : 0;
  const replayBarValues = {
    ...REPLAY_BAR,
    x: replayBarInset,
    w: replayAreaValues.w - 2 * replayBarInset,
  };
  globals.elements.replayBar = new Konva.Rect({
    x: replayBarValues.x * winW,
    y: replayBarValues.y * winH,
    width: replayBarValues.w * winW,
    height: replayBarValues.h * winH,
    fill: "black",
    cornerRadius: replayBarValues.cornerRadius * winH,
    listening: false,
  });
  globals.elements.replayArea.add(globals.elements.replayBar);

  // An invisible rectangle over the visible black rectangle above (which is slightly bigger so that
  // it is easier to click on).
  const replayBarClickRect = new Konva.Rect({
    x: replayBarValues.x * winW,
    y: 0,
    width: replayBarValues.w * winW,
    height: REPLAY_BAR.clickH * winH,
    listening: true,
  });
  replayBarClickRect.on("click tap", replay.barClick);
  replayBarClickRect.on("wheel", replay.barScroll);
  globals.elements.replayArea.add(replayBarClickRect);

  const shuttleValues = {
    ...REPLAY_SHUTTLE,
    stroke: "black",
    strokeWidth: THIN_STROKE_WIDTH,
  };

  // The shared (white) replay shuttle. (We want it to be behind the normal replay shuttle, so we
  // define it first.)
  globals.elements.replayShuttleShared = new Shuttle({
    width: shuttleValues.w * winW,
    height: shuttleValues.h * winH,
    offset: {
      x: (shuttleValues.w / 2) * winW,
      y: (shuttleValues.h / 2) * winH,
    },
    cornerRadius: shuttleValues.cornerRadius * winW,
    fill: getCanvasColors().replayShuttle,
    stroke: shuttleValues.stroke,
    strokeWidth: shuttleValues.strokeWidth * winH,
    visible: false,
    listening: true,
  });
  globals.elements.replayShuttleShared.on("click tap", () => {
    if (globals.state.replay.shared !== undefined) {
      replay.goToSegment(globals.state.replay.shared.segment, true);
    }
  });
  globals.elements.replayArea.add(globals.elements.replayShuttleShared);

  // This is the normal (blue) replay shuttle.
  globals.elements.replayShuttle = new Shuttle({
    width: shuttleValues.w * winW,
    height: shuttleValues.h * winH,
    offset: {
      x: (shuttleValues.w / 2) * winW,
      y: (shuttleValues.h / 2) * winH,
    },
    cornerRadius: shuttleValues.cornerRadius * winW,
    fill: REPLAY_SHUTTLE_COLOR,
    draggable: true,
    dragBoundFunc: replay.shuttleDragBound,
    stroke: shuttleValues.stroke,
    strokeWidth: shuttleValues.strokeWidth * winH,
    listening: true,
  });
  globals.elements.replayShuttle.on("dragmove", replay.shuttleDragMove);
  globals.elements.replayShuttle.on("wheel", replay.barScroll);
  globals.elements.replayArea.add(globals.elements.replayShuttle);

  const row = getReplayButtonRow(keldonMode, false);
  const replayButtonValues = {
    ...REPLAY_BUTTON,
    x: row.x,
    w: row.buttonWidth,
    spacing: row.spacing,
  };

  {
    let { x } = replayButtonValues;

    // Go back to the beginning (the left-most button).
    globals.elements.replayBackFullButton = new Button(
      {
        x: x * winW,
        y: replayButtonValues.y * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
        listening: true,
      },
      [
        lobbyGlobals.imageLoader.get("replay-back-full"),
        lobbyGlobals.imageLoader.get("replay-back-full-disabled"),
      ],
    );
    globals.elements.replayBackFullButton.on("click tap", replay.backFull);
    globals.elements.replayArea.add(globals.elements.replayBackFullButton);

    // Go back one turn (the second left-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayBackButton = new Button(
      {
        x: x * winW,
        y: replayButtonValues.y * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        lobbyGlobals.imageLoader.get("replay-back"),
        lobbyGlobals.imageLoader.get("replay-back-disabled"),
      ],
    );
    globals.elements.replayBackButton.on("click tap", () => {
      // Prevent accidental double clicks.
      if (
        Date.now() - globals.uiClickTime
        < ACCIDENTAL_DOUBLE_CLICK_MILLISECONDS
      ) {
        return;
      }
      globals.uiClickTime = Date.now();

      replay.back();
    });
    globals.elements.replayArea.add(globals.elements.replayBackButton);

    // Go forward one turn (the second right-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayForwardButton = new Button(
      {
        x: x * winW,
        y: replayButtonValues.y * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        lobbyGlobals.imageLoader.get("replay-forward"),
        lobbyGlobals.imageLoader.get("replay-forward-disabled"),
      ],
    );
    globals.elements.replayForwardButton.on("click tap", () => {
      // Prevent accidental double clicks.
      if (
        Date.now() - globals.uiClickTime
        < ACCIDENTAL_DOUBLE_CLICK_MILLISECONDS
      ) {
        return;
      }
      globals.uiClickTime = Date.now();

      replay.forward();
    });
    globals.elements.replayArea.add(globals.elements.replayForwardButton);

    // Go forward to the end (the right-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayForwardFullButton = new Button(
      {
        x: x * winW,
        y: replayButtonValues.y * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        lobbyGlobals.imageLoader.get("replay-forward-full"),
        lobbyGlobals.imageLoader.get("replay-forward-full-disabled"),
      ],
    );
    globals.elements.replayForwardFullButton.on(
      "click tap",
      replay.forwardFull,
    );
    globals.elements.replayArea.add(globals.elements.replayForwardFullButton);

    // The bot analysis' buttons for the previous and the next move that the bot would have played
    // differently. They are only shown once there is an analysis (see "analysis.ts"), which also
    // moves the other buttons to make room.
    for (const [name, text, direction] of [
      ["replayBackAnalysisButton", "<!", -1],
      ["replayForwardAnalysisButton", "!>", 1],
    ] as const) {
      const button = new Button({
        x: 0,
        y: replayButtonValues.y * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
        text,
        fontSize: 0.03 * winH,
        visible: false,
      });
      button.on("click tap", () => {
        analysis.goToFlagged(direction);
      });
      globals.elements[name] = button;
      globals.elements.replayArea.add(button);
    }
  }

  const extra = REPLAY_BOTTOM_BUTTON.extraW;
  const totalWidth =
    replayButtonValues.w * NUM_REPLAY_BUTTONS
    + replayButtonValues.spacing * (NUM_REPLAY_BUTTONS - 1);
  // The bot analysis' button is a small square between the two buttons on the bottom row, so those
  // are a little narrower than two of the buttons above them side by side. Together they take the
  // same width as before.
  const analysisButtonWidth = 0.035;
  const analysisButtonGap = 0.005;
  const bottomRowWidth =
    2 * (replayButtonValues.w * 2 + replayButtonValues.spacing + extra)
    + replayButtonValues.spacing;
  const bottomButtonValues = {
    y: REPLAY_BOTTOM_BUTTON.y,
    w: (bottomRowWidth - analysisButtonWidth - 2 * analysisButtonGap) / 2,
    h: REPLAY_BOTTOM_BUTTON.h,
  };
  const bottomLeftReplayButtonX = replayButtonValues.x - extra;
  const bottomCenterReplayButtonX =
    replayButtonValues.x + (totalWidth - bottomButtonValues.w) / 2;
  const bottomRightReplayButtonX =
    bottomLeftReplayButtonX
    + bottomButtonValues.w
    + analysisButtonWidth
    + 2 * analysisButtonGap;
  // The "Exit Replay" button.
  globals.elements.replayExitButton = new Button({
    x: bottomRightReplayButtonX * winW,
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: bottomButtonValues.h * winH,
    text: "Exit Replay",
    visible: !globals.state.finished,
  });
  globals.elements.replayExitButton.on("click tap", replay.exitButton);
  globals.elements.replayArea.add(globals.elements.replayExitButton);

  // The next two buttons will be moved to the left for replay leaders and centered for
  // non-replay-leaders.
  function setCenter(this: SharedTurnsButton) {
    this.x(bottomCenterReplayButtonX * winW);
  }

  function setLeft(this: SharedTurnsButton) {
    this.x(bottomLeftReplayButtonX * winW);
  }

  // The "Pause Shared Turns" button. (This will be shown when the client receives the
  // "replayLeader" command.)
  globals.elements.pauseSharedTurnsButton = new SharedTurnsButton({
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: bottomButtonValues.h * winH,
    text: "Pause Shared Turns",
    visible: false,
  });
  globals.elements.pauseSharedTurnsButton.on(
    "click tap",
    replay.toggleSharedSegments,
  );
  globals.elements.pauseSharedTurnsButton.setCenter = setCenter;
  globals.elements.pauseSharedTurnsButton.setCenter(); // Set it to be center by default
  globals.elements.pauseSharedTurnsButton.setLeft = setLeft;
  globals.elements.replayArea.add(globals.elements.pauseSharedTurnsButton);

  // The "Use Shared Turns" button. (This will be shown when the client receives the "replayLeader"
  // command.)
  globals.elements.useSharedTurnsButton = new SharedTurnsButton({
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: bottomButtonValues.h * winH,
    text: "Use Shared Turns",
    visible: false,
  });
  globals.elements.useSharedTurnsButton.on(
    "click tap",
    replay.toggleSharedSegments,
  );
  globals.elements.useSharedTurnsButton.setCenter = setCenter;
  globals.elements.useSharedTurnsButton.setCenter(); // Set it to be center by default
  globals.elements.useSharedTurnsButton.setLeft = setLeft;
  globals.elements.replayArea.add(globals.elements.useSharedTurnsButton);

  // The "Enter Hypothetical" button.
  globals.elements.enterHypoButton = new EnterHypoButton({
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: bottomButtonValues.h * winH,
    text: "Enter Hypothetical",
  });
  globals.elements.enterHypoButton.on(
    "click tap",
    hypothetical.startHypothetical,
  );
  globals.elements.replayArea.add(globals.elements.enterHypoButton);

  // This button will be moved to the left during in-game replay, centered during private replay,
  // and right during shared replay.

  function enterHypoSetLeft(this: EnterHypoButton) {
    this.x(bottomLeftReplayButtonX * winW);
    placeAnalysisButton(this, "right"); // No room on the left of the first button
  }

  function enterHypoSetCenter(this: EnterHypoButton) {
    this.x(bottomCenterReplayButtonX * winW);
    placeAnalysisButton(this, "left");
  }

  function enterHypoSetRight(this: EnterHypoButton) {
    this.x(bottomRightReplayButtonX * winW);
    placeAnalysisButton(this, "left");
  }

  globals.elements.enterHypoButton.setLeft = enterHypoSetLeft;
  globals.elements.enterHypoButton.setCenter = enterHypoSetCenter;
  globals.elements.enterHypoButton.setRight = enterHypoSetRight;

  // The "Bot analysis" button: a small robot next to the "Enter Hypothetical" button. It is only
  // shown for finished games when the setting is on (see "analysis.ts").
  const analysisButton = new Button({
    y: bottomButtonValues.y * winH,
    width: analysisButtonWidth * winW,
    height: bottomButtonValues.h * winH,
    // eslint-disable-next-line complete/require-ascii
    text: "🤖",
    fontSize: 0.03 * winH,
    visible: false,
  });
  analysisButton.on("click tap", analysis.togglePanel);
  analysisButton.tooltipName = "bot-analysis";
  analysisButton.tooltipContent =
    "Bot analysis: the bot goes through this game in your browser and marks every move it would have played differently.";
  initKonvaTooltips(analysisButton, true, false);
  globals.elements.analysisButton = analysisButton;
  globals.elements.replayArea.add(analysisButton);

  // The robot follows the "Enter Hypothetical" button, which moves depending on the kind of replay.
  // It goes on the left of it (between it and the "Use Shared Turns" button in a shared replay), so
  // that the row does not extend further to the right.
  function placeAnalysisButton(
    hypoButton: EnterHypoButton,
    side: "left" | "right",
  ) {
    const gap = analysisButtonGap * winW;
    analysisButton.x(
      side === "left"
        ? hypoButton.x() - gap - analysisButton.width()
        : hypoButton.x() + hypoButton.width() + gap,
    );
  }
  placeAnalysisButton(globals.elements.enterHypoButton, "left");

  // Add the replay area to the UI.
  globals.layers.UI.add(globals.elements.replayArea);
  replay.adjustShuttles(true); // Skip the animation
  analysis.updateButton(); // Show the bot analysis again if the UI was rebuilt
  analysis.refresh();
}
