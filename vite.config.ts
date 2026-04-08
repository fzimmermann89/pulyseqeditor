import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true" && repositoryName;

  return {
    base: isGitHubPagesBuild ? `/${repositoryName}/` : "/",
    plugins: [react()],
    optimizeDeps: {
      exclude: ["pyodide"],
    },
    worker: {
      format: "es",
    },
  };
});
