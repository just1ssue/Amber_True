import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages向け: https://<user>.github.io/<repo>/
// リポジトリ名に合わせて base を変更してください。
const repoName = "Amber_True";

export default defineConfig({
  plugins: [react()],
  base: `/${repoName}/`,
});
