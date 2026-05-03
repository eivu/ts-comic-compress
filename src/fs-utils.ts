import * as fs from "node:fs";
import * as fsp from "node:fs/promises";

export const stat = fsp.stat;
export const readFile = fsp.readFile;
export const readdir = fsp.readdir;
export const mkdtemp = fsp.mkdtemp;
export const createWriteStream = fs.createWriteStream;

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fsp.mkdir(p, { recursive: true });
}

export async function remove(p: string): Promise<void> {
  await fsp.rm(p, { recursive: true, force: true });
}

export async function copy(src: string, dest: string): Promise<void> {
  await fsp.cp(src, dest, { recursive: true, force: true });
}

export async function move(src: string, dest: string): Promise<void> {
  try {
    await fsp.rename(src, dest);
  } catch (err) {
    // Cross-device rename fails with EXDEV; fall back to copy + remove.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") {
      throw err;
    }
    await fsp.cp(src, dest, { recursive: true, force: true });
    await fsp.rm(src, { recursive: true, force: true });
  }
}
