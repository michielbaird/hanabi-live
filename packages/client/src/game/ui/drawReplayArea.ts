import Konva from "konva";
import { getCanvasColors } from "../../theme";
import { globals } from "./UIGlobals";
import * as analysis from "./analysis";
import { Button } from "./controls/Button";
import { EnterHypoButton } from "./controls/EnterHypoButton";
import { SharedTurnsButton } from "./controls/SharedTurnsButton";
import { Shuttle } from "./controls/Shuttle";
import * as hypothetical from "./hypothetical";
import { initKonvaTooltips } from "./konvaTooltips";
import * as replay from "./replay";
import { getReplayButtonRow } from "./replayButtonRow";

export function drawReplayArea(winW: number, winH: number): void {
  const replayAreaValues = {
    x: 0.15,
    y: 0.51,
    w: 0.5,
  };
  if (!globals.lobby.settings.keldonMode) {
    replayAreaValues.x = 0.01;
    replayAreaValues.y = 0.49;
    replayAreaValues.w = 0.4;
  }

  globals.elements.replayArea = new Konva.Group({
    x: replayAreaValues.x * winW,
    y: replayAreaValues.y * winH,
    width: replayAreaValues.w * winW,
    height: 0.27 * winH,
    visible: false,
    listening: false,
  });

  // The thin black rectangle that the replay slider slides on.
  const replayBarValues = {
    x: globals.lobby.settings.keldonMode ? 0.01 : 0,
    y: 0.0425,
    w: globals.lobby.settings.keldonMode ? 0.481 : replayAreaValues.w,
    h: 0.01,
  };
  globals.elements.replayBar = new Konva.Rect({
    x: replayBarValues.x * winW,
    y: replayBarValues.y * winH,
    width: replayBarValues.w * winW,
    height: replayBarValues.h * winH,
    fill: "black",
    cornerRadius: 0.005 * winH,
    listening: false,
  });
  globals.elements.replayArea.add(globals.elements.replayBar);

  // An invisible rectangle over the visible black rectangle above (which is slightly bigger so that
  // it is easier to click on).
  const replayBarClickRect = new Konva.Rect({
    x: replayBarValues.x * winW,
    y: 0,
    width: replayBarValues.w * winW,
    height: 0.07 * winH,
    listening: true,
  });
  replayBarClickRect.on("click tap", replay.barClick);
  replayBarClickRect.on("wheel", replay.barScroll);
  globals.elements.replayArea.add(replayBarClickRect);

  const shuttleValues = {
    w: 0.03,
    h: 0.03,
    cornerRadius: 0.01,
    stroke: "black",
    strokeWidth: 0.001_217,
  };

  // The shared (white) replay shuttle. (We want it to be behind the normal replay shuttle, so we
  // define it first.)
  globals.elements.replayShuttleShared = new Shuttle({
    width: shuttleValues.w * winW,
    height: shuttleValues.h * winH,
    offset: {
      x: (shuttleValues.w / 2) * winW,
      y: (shuttleValues.h / 2) * winW,
    },
    cornerRadius: shuttleValues.cornerRadius * winW,
    fill: getCanvasColors().replayShuttle,
    stroke: shuttleValues.stroke,
    strokeWidth: shuttleValues.strokeWidth * winW,
    visible: false,
    listening: true,
  });
  globals.elements.replayShuttleShared.on("click tap", () => {
    if (globals.state.replay.shared !== null) {
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
      y: (shuttleValues.h / 2) * winW,
    },
    cornerRadius: shuttleValues.cornerRadius * winW,
    fill: "#0000cc", // Blue
    draggable: true,
    dragBoundFunc: replay.shuttleDragBound,
    stroke: shuttleValues.stroke,
    strokeWidth: shuttleValues.strokeWidth * winW,
    listening: true,
  });
  globals.elements.replayShuttle.on("dragmove", replay.shuttleDragMove);
  globals.elements.replayShuttle.on("wheel", replay.barScroll);
  globals.elements.replayArea.add(globals.elements.replayShuttle);

  const row = getReplayButtonRow(globals.lobby.settings.keldonMode, false);
  const replayButtonValues = {
    x: row.x,
    w: row.buttonWidth,
    h: 0.08,
    spacing: row.spacing,
  };

  {
    let { x } = replayButtonValues;

    // Go back to the beginning (the left-most button).
    globals.elements.replayBackFullButton = new Button(
      {
        x: x * winW,
        y: 0.07 * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
        listening: true,
      },
      [
        globals.imageLoader!.get("replay-back-full"),
        globals.imageLoader!.get("replay-back-full-disabled"),
      ],
    );
    globals.elements.replayBackFullButton.on("click tap", replay.backFull);
    globals.elements.replayArea.add(
      globals.elements.replayBackFullButton as unknown as Konva.Group,
    );

    // Go back one turn (the second left-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayBackButton = new Button(
      {
        x: x * winW,
        y: 0.07 * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        globals.imageLoader!.get("replay-back"),
        globals.imageLoader!.get("replay-back-disabled"),
      ],
    );
    globals.elements.replayBackButton.on("click tap", () => {
      // Prevent accidental double clicks.
      if (Date.now() - globals.UIClickTime < 50) {
        return;
      }
      globals.UIClickTime = Date.now();

      replay.back();
    });
    globals.elements.replayArea.add(
      globals.elements.replayBackButton as unknown as Konva.Group,
    );

    // Go forward one turn (the second right-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayForwardButton = new Button(
      {
        x: x * winW,
        y: 0.07 * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        globals.imageLoader!.get("replay-forward"),
        globals.imageLoader!.get("replay-forward-disabled"),
      ],
    );
    globals.elements.replayForwardButton.on("click tap", () => {
      // Prevent accidental double clicks.
      if (Date.now() - globals.UIClickTime < 50) {
        return;
      }
      globals.UIClickTime = Date.now();

      replay.forward();
    });
    globals.elements.replayArea.add(
      globals.elements.replayForwardButton as unknown as Konva.Group,
    );

    // Go forward to the end (the right-most button).
    x += replayButtonValues.w + replayButtonValues.spacing;
    globals.elements.replayForwardFullButton = new Button(
      {
        x: x * winW,
        y: 0.07 * winH,
        width: replayButtonValues.w * winW,
        height: replayButtonValues.h * winH,
      },
      [
        globals.imageLoader!.get("replay-forward-full"),
        globals.imageLoader!.get("replay-forward-full-disabled"),
      ],
    );
    globals.elements.replayForwardFullButton.on(
      "click tap",
      replay.forwardFull,
    );
    globals.elements.replayArea.add(
      globals.elements.replayForwardFullButton as unknown as Konva.Group,
    );

    // The bot analysis' buttons for the previous and the next move that the bot would have played
    // differently. They are only shown once there is an analysis (see "analysis.ts"), which also
    // moves the other buttons to make room.
    for (const [name, text, direction] of [
      ["replayBackAnalysisButton", "<!", -1],
      ["replayForwardAnalysisButton", "!>", 1],
    ] as const) {
      const button = new Button({
        x: 0,
        y: 0.07 * winH,
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
      globals.elements.replayArea.add(button as unknown as Konva.Group);
    }
  }

  const extra = 0.04;
  const totalWidth = replayButtonValues.w * 4 + replayButtonValues.spacing * 3;
  const bottomButtonValues = {
    y: 0.17,
    w: replayButtonValues.w * 2 + replayButtonValues.spacing + extra,
    h: 0.06,
  };
  const bottomLeftReplayButtonX = replayButtonValues.x - extra;
  const bottomCenterReplayButtonX =
    replayButtonValues.x + (totalWidth - bottomButtonValues.w) / 2;
  const bottomRightReplayButtonX =
    replayButtonValues.x
    + replayButtonValues.w * 2
    + replayButtonValues.spacing * 2;
  // The "Exit Replay" button.
  globals.elements.replayExitButton = new Button({
    x: bottomRightReplayButtonX * winW,
    y: bottomButtonValues.y * winH,
    width: bottomButtonValues.w * winW,
    height: replayButtonValues.w * winH,
    text: "Exit Replay",
    visible: !globals.state.finished,
  });
  globals.elements.replayExitButton.on("click tap", replay.exitButton);
  globals.elements.replayArea.add(
    globals.elements.replayExitButton as unknown as Konva.Group,
  );

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
  globals.elements.replayArea.add(
    globals.elements.pauseSharedTurnsButton as unknown as Konva.Group,
  );

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
  globals.elements.replayArea.add(
    globals.elements.useSharedTurnsButton as unknown as Konva.Group,
  );

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
  globals.elements.replayArea.add(
    globals.elements.enterHypoButton as unknown as Konva.Group,
  );

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
    placeAnalysisButton(this, "right");
  }

  globals.elements.enterHypoButton.setLeft = enterHypoSetLeft;
  globals.elements.enterHypoButton.setCenter = enterHypoSetCenter;
  globals.elements.enterHypoButton.setRight = enterHypoSetRight;

  // The "Bot analysis" button: a small robot next to the "Enter Hypothetical" button. It is only
  // shown for finished games when the setting is on (see "analysis.ts").
  const analysisButton = new Button({
    y: bottomButtonValues.y * winH,
    width: 0.035 * winW,
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
  globals.elements.replayArea.add(analysisButton as unknown as Konva.Group);

  // The robot follows the "Enter Hypothetical" button, which moves depending on the kind of replay.
  // It goes on the left of it, except in a shared replay, where the "Use Shared Turns" button is
  // there and leaves no room.
  function placeAnalysisButton(
    hypoButton: EnterHypoButton,
    side: "left" | "right",
  ) {
    const gap = 0.005 * winW;
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
