// Where the buttons of the replay controls go, as a fraction of the window width. The row is
// shifted and tightened when the bot analysis adds its two "previous/next flagged move" buttons.

export interface ReplayButtonRow {
  /** Where the first button starts. */
  x: number;
  /** The width of every button. */
  buttonWidth: number;
  /** The gap between buttons. */
  spacing: number;
}

export function getReplayButtonRow(
  keldonMode: boolean,
  withAnalysisButtons: boolean,
): ReplayButtonRow {
  const buttonWidth = 0.06;
  if (!withAnalysisButtons) {
    return {
      x: keldonMode ? 0.1 : 0.05,
      buttonWidth,
      spacing: 0.02,
    };
  }

  // Six buttons take the width of the replay area (0.4, or 0.5 in Keldon mode, which also starts
  // 0.1 in).
  return { x: keldonMode ? 0.1 : 0, buttonWidth, spacing: 0.008 };
}
