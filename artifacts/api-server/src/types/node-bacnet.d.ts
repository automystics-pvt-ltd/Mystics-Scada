/**
 * Minimal ambient declaration for `node-bacnet` — the package ships no types.
 * Only declared as `any`-shaped since the driver interacts with it through
 * dynamic `import()` and narrows the shape itself at runtime.
 */
declare module "node-bacnet" {
  const mod: any;
  export default mod;
}
