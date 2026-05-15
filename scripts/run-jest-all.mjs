import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function run(label, cmd) {
  console.log(`\n[test:jest] ${label}\n`);
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
}

run("Next gateway (Jest)", "pnpm -C apps/anime-video-generate-agent-server test:jest");
run("Nest (Jest)", "pnpm -C services/anime-video-generate-agent-nest test");
