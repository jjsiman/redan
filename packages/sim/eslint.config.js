// @ts-check
import tseslint from "typescript-eslint";

/**
 * Portability contract (doc 4.1): no DOM, no `window`, no `performance.now`,
 * no host-seeded RNG. If this fails, something in packages/sim reached for
 * an API that won't exist identically in the browser, Node, and an edge
 * worker, or that breaks determinism given the same seed.
 */
const FORBIDDEN_GLOBALS = ["window", "document", "performance", "navigator", "localStorage"];

export default tseslint.config(
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...FORBIDDEN_GLOBALS.map((name) => ({
          name,
          message: `${name} is a host API — packages/sim must run identically in browser, Node, and edge workers.`,
        })),
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Use the injected Rng (createRng/seed) instead of Math.random — sim must be deterministic.",
        },
        {
          object: "Date",
          property: "now",
          message: "Date.now() is non-deterministic and a host API — not allowed in packages/sim.",
        },
      ],
      "no-undef": "off",
    },
  },
);
