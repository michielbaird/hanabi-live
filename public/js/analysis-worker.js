// Runs the bot (hanab-bot-rs compiled to WebAssembly, see "scripts/bash/build_analysis_wasm.sh") off the main thread, since
// an analysis takes many seconds. The worker loads the bot once and answers two kinds of messages:
//
// { type: "supports", variant, emptyClues, detrimentalCharacters, oneExtraCard, oneLessCard }
//   -> { type: "supports", supported }
// { type: "analyze", exportJson, variant, convention, endgameTimeoutMs }
//   -> { type: "progress", done, total } ..., then { type: "result", result }
//
// Any failure is answered with { type: "error", message } (for an analysis) or { type: "supports", supported: false }.
import init, {
  analyze,
  init_variants,
  is_game_supported,
} from "/public/wasm/hanab_bot_wasm.js";

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.text();
}

let loaded;
function load() {
  loaded ??= (async () => {
    await init();
    const [variants, suits] = await Promise.all([
      fetchText("/public/wasm/variants.json"),
      fetchText("/public/wasm/suits.json"),
    ]);
    init_variants(variants, suits);
  })();
  return loaded;
}

globalThis.onmessage = async (event) => {
  const message = event.data;
  try {
    await load();
    if (message.type === "supports") {
      globalThis.postMessage({
        type: "supports",
        supported: is_game_supported(
          message.variant,
          message.emptyClues,
          message.detrimentalCharacters,
          message.oneExtraCard,
          message.oneLessCard,
        ),
      });
    } else {
      const text = analyze(
        message.exportJson,
        message.variant,
        message.convention,
        message.endgameTimeoutMs,
        (done, total) => {
          globalThis.postMessage({ type: "progress", done, total });
        },
      );
      globalThis.postMessage({ type: "result", result: JSON.parse(text) });
    }
  } catch (error) {
    if (message.type === "supports") {
      globalThis.postMessage({ type: "supports", supported: false });
    } else {
      globalThis.postMessage({ type: "error", message: String(error) });
    }
  }
};
