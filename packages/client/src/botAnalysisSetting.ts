// The "Bot analysis" setting: whether finished games offer an analysis by the bot. It is a
// client-only setting (kept in localStorage, like the dark mode), and it is off by default. This
// module is small on purpose: the settings page imports it, and it must not pull in the game UI.

const STORAGE_KEY = "botAnalysis";

export function isBotAnalysisEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // localStorage may be unavailable (e.g. private browsing, disabled).
    return false;
  }
}

export function setBotAnalysisEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // The localStorage API may be unavailable.
  }
}
