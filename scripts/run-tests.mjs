import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function files(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : entry.name.endsWith(".test.ts") ? [path] : [];
    });
  } catch {
    return [];
  }
}

for (const file of [...files("packages"), ...files("apps")]) {
  await import(pathToFileURL(resolve(file)).href);
}
// Native-game bridge tests use each source's module format and load the real
// game scripts in a VM; no browser subprocess is needed for this CI gate.
for (const file of ["cartridges/emonad-cabinet/tools/arcade-bridge.test.js", "cartridges/two-places/tests/arcade-bridge.mjs", "scripts/raid-readiness.test.mjs"]) {
  await import(pathToFileURL(resolve(file)).href);
}
