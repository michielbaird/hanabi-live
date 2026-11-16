// The bot's game analysis, in a Web Worker so that the page stays responsive while it thinks (an
// analysis takes many seconds). It is bundled on its own by esbuild (see "build_client.sh") and
// started by "game/ui/analysis.ts", which describes the messages. The bot is "hanab-bot-rs"
// compiled to WebAssembly, an npm package.

import init, {
  analyze,
  init_variants,
  is_game_supported,
} from "hanab-bot-wasm";
import wasmURL from "hanab-bot-wasm/hanab_bot_wasm_bg.wasm?url";
// The raw data files are not exported by the game package (it exports what is made from them).
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import suitsJSON from "@hanabi-live/game/src/json/suits.json";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import variantsJSON from "@hanabi-live/game/src/json/variants.json";

interface SupportsRequest {
  type: "supports";
  variant: string;
  emptyClues: boolean;
  detrimentalCharacters: boolean;
  oneExtraCard: boolean;
  oneLessCard: boolean;
}

interface AnalyzeRequest {
  type: "analyze";
  exportJson: string;
  variant: string;
  convention: string;
  endgameTimeoutMs: number;
}

type Request = SupportsRequest | AnalyzeRequest;

/** The parts of the worker's global scope that are used (the client is compiled for the DOM). */
interface WorkerScope {
  postMessage: (message: unknown) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<Request>) => void,
  ) => void;
}
const scope = globalThis as unknown as WorkerScope;

let loaded: Promise<void> | undefined;

/** Loads the bot, once. */
async function load() {
  loaded ??= (async () => {
    await init({ module_or_path: wasmURL });
    init_variants(JSON.stringify(variantsJSON), JSON.stringify(suitsJSON));
  })();
  await loaded;
}

async function handle(request: Request) {
  try {
    await load();

    switch (request.type) {
      case "supports": {
        scope.postMessage({
          type: "supports",
          supported: is_game_supported(
            request.variant,
            request.emptyClues,
            request.detrimentalCharacters,
            request.oneExtraCard,
            request.oneLessCard,
          ),
        });
        break;
      }

      case "analyze": {
        const text = analyze(
          request.exportJson,
          request.variant,
          request.convention,
          request.endgameTimeoutMs,
          (done: number, total: number) => {
            scope.postMessage({
              type: "progress",
              done,
              total,
            });
          },
        );
        const result: unknown = JSON.parse(text);
        scope.postMessage({
          type: "result",
          result,
        });
        break;
      }
    }
  } catch (error) {
    // A question about support that fails means that the bot can't be used.
    scope.postMessage(
      request.type === "supports"
        ? {
          type: "supports",
          supported: false,
        }
        : {
          type: "error",
          message: String(error),
        },
    );
  }
}

scope.addEventListener("message", (event) => {
  handle(event.data).catch((error: unknown) => {
    console.error(error);
  });
});
