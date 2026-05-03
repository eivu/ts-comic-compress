#!/usr/bin/env node
// Ensure the compiled CLI entry has a hashbang and is executable. tsc 5.x
// preserves a leading hashbang from src/index.ts, but this script is the
// belt-and-braces to keep the bin runnable on POSIX even if that ever changes.
import { readFile, writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const binPath = path.resolve(__dirname, "..", "dist", "index.js");

const HASHBANG = "#!/usr/bin/env node\n";

const contents = await readFile(binPath, "utf8");
if (!contents.startsWith("#!")) {
  await writeFile(binPath, HASHBANG + contents);
}

await chmod(binPath, 0o755);
