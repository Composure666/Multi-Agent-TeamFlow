import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist-electron/**",
    ".agenthub-data/**",
    // 本地一次性探针 / 调试脚本（同样在 .gitignore 里，不会进版本库）。
    // 不加这两条时，本机 `pnpm lint` 会被 .tmp-probe 里的 require() 打出 7 条 error，
    // 而 CI 上根本不存在这个目录 —— 表现为「本地红、CI 绿」，极易误判。
    ".tmp-probe/**",
    ".workbuddy/**",
    ".tmp/**",
    ".pnpm-store/**",
    ".understand-anything/**",
    "learn-claude-code/**",
    "release/**",
    "apps/mobile/android/**/build/**",
    "apps/mobile/android/app/src/main/assets/**",
    "apps/mobile/dist/**",
    "apps/mobile/ios/App/App/public/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
