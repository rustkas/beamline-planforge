import { existsSync } from "node:fs";
import path from "node:path";

function find_repo_root(start: string): string {
  let current = start;
  while (!existsSync(path.join(current, "package.json"))) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

const repo = find_repo_root(process.cwd());
const proc = Bun.spawn(["bun", "tools/wasm/cli.ts", "build", process.cwd()], {
  cwd: repo,
  stdout: "inherit",
  stderr: "inherit"
});

const code = await proc.exited;
process.exit(code);
