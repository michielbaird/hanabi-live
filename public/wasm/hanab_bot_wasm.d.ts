/* tslint:disable */
/* eslint-disable */

/**
 * Analyses a finished game: every move that is not what the bot would have done.
 *
 * * `game_json`: the game as hanab.live exports it (`/export/<id>`): `players`, `deck` and `actions`.
 * * `variant`: the variant's name, e.g. `"No Variant"`.
 * * `convention`: `"HGroup"`, `"Reactor"` or `"RefSieve"` (with a level where it has one, e.g. `"HGroup3"`).
 * * `endgame_timeout_ms`: how long each endgame winrate may take (0 for the default, 500 ms). A search that runs out
 *   of time counts as a winrate of 0, so on a slow device a longer limit avoids spurious "mistake" comments.
 * * `progress`: optional `(movesDone, movesTotal) => void`, called after every move examined.
 *
 * Returns JSON text: `{"players": [...], "comments": [{"turn", "player", "mistake", "text"}]}`.
 */
export function analyze(game_json: string, variant: string, convention: string, endgame_timeout_ms: number, progress?: Function | null): string;

/**
 * Loads the variant tables: the text of hanabi-live's `variants.json` and `suits.json` (`packages/game/src/json`).
 * Call once, before [`analyze`].
 */
export function init_variants(variants_json: string, colours_json: string): void;

/**
 * Whether the bot can follow games with this variant and these table options: false for the variants it knows it cannot
 * play (Blind, Mute, Up or Down, ...) and for the options it can't handle. The lists are in the bot's `client.rs`, so
 * that the page does not need a copy of them.
 */
export function is_game_supported(variant: string, empty_clues: boolean, detrimental_characters: boolean, one_extra_card: boolean, one_less_card: boolean): boolean;

/**
 * The bot version, e.g. `v1.3.0 (hanab-bot-rs)`.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly analyze: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly init_variants: (a: number, b: number, c: number, d: number) => [number, number];
    readonly is_game_supported: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly version: () => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
