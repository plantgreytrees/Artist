// Flat config with inline core rules only: eslint runs from PATH (craftsman's gate),
// so this file cannot import @eslint/js or other packages from the repo.
const shared = {
  console: "readonly",
  process: "readonly",
  URL: "readonly",
  fetch: "readonly",
};
const browser = {
  window: "readonly",
  document: "readonly",
  location: "readonly",
  performance: "readonly",
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "scripts/fixtures/**",
      "evals/results/**",
      ".artist/**",
      ".craftsman/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      // Browser globals appear inside Playwright page.evaluate callbacks.
      globals: { ...shared, ...browser },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "no-const-assign": "error",
      "no-self-assign": "error",
      "no-self-compare": "error",
      "no-cond-assign": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-fallthrough": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-dupe-else-if": "error",
      "no-import-assign": "error",
      "no-loss-of-precision": "error",
      "no-sparse-arrays": "error",
      "no-useless-escape": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
    },
  },
];
