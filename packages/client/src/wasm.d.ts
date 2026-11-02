/* eslint-disable import-x/no-default-export */

// The "file" loader of esbuild turns an import of a ".wasm" file into the URL that it is served at.
declare module "*.wasm" {
  const url: string;
  export default url;
}
