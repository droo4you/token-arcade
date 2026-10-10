import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(process.execPath, ["--env-file-if-exists=.env", "scripts/cartridges.mjs"], { stdio: "inherit" }),
  spawn(npm, ["run", "dev:api"], { stdio: "inherit", shell: process.platform === "win32" }),
  spawn(npm, ["run", "dev:web"], { stdio: "inherit", shell: process.platform === "win32" }),
];

const stop = () => {
  for (const child of children) child.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      stop();
      process.exitCode = code;
    }
  });
}
