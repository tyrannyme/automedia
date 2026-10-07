import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "react", "unicorn", "import", "node"],
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  env: {
    builtin: true,
  },
  settings: {
    react: {
      version: "19.2.8",
    },
  },
  ignorePatterns: [
    ".vite/**",
    "out/**",
    "node_modules/**",
    "dist/**",
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
  rules: {
    "react/react-in-jsx-scope": "off",
    "import/no-unassigned-import": "off",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
  overrides: [
    {
      // The engine runs under plain Node, shared by agents and the studio.
      files: ["src/engine/**/*.ts", "src/cli/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "electron",
                message: "The engine runs under plain Node. Keep Electron in src/main.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/renderer/**/*.{ts,tsx}"],
      env: {
        browser: true,
      },
    },
    {
      files: [
        "src/main/**/*.ts",
        "src/engine/**/*.ts",
        "src/cli/**/*.ts",
        "src/preload/**/*.ts",
        "src/shared/**/*.ts",
        "*.config.ts",
        "forge.config.ts",
      ],
      env: {
        node: true,
      },
    },
  ],
});
