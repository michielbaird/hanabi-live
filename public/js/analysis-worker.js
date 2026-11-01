// Runs the bot's game analysis (hanab-bot-rs compiled to WebAssembly, see "scripts/bash/build_analysis_wasm.sh") off the
// main thread, since an analysis takes many seconds. Messages in: { exportJson, variant, convention, endgameTimeoutMs }.
// Messages out: { type: "progress", done, total }, { type: "result", result } or { type: "error", message }.
import init, { analyze, init_variants } from "/public/wasm/hanab_bot_wasm.js";

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.text();
}

globalThis.onmessage = async (event) => {
  const { exportJson, variant, convention, endgameTimeoutMs } = event.data;
  try {
    await init();
    const [variants, suits] = await Promise.all([
      fetchText("/public/wasm/variants.json"),
      fetchText("/public/wasm/suits.json"),
    ]);
    init_variants(variants, suits);
    const text = analyze(
      exportJson,
      variant,
      convention,
      endgameTimeoutMs,
      (done, total) => {
        globalThis.postMessage({ type: "progress", done, total });
      },
    );
    globalThis.postMessage({ type: "result", result: JSON.parse(text) });
  } catch (error) {
    globalThis.postMessage({ type: "error", message: String(error) });
  }
};
