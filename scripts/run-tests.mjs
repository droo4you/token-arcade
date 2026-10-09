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
