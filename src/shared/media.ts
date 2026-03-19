import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from './logger.js';

/** Parse mediaUrls from material. Supports JSON array or newline/comma-separated. */
export function parseMediaUrls(mediaUrls: string | null | undefined): string[] {
  if (!mediaUrls || !mediaUrls.trim()) return [];
  const trimmed = mediaUrls.trim();
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === 'string' && u.startsWith('http')) : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split(/[\n,]+/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith('http'));
}

/** Download URL to temp file. Returns path or null on failure. */
export async function downloadToTemp(url: string): Promise<string | null> {
  const tmpDir = os.tmpdir();
  const ext = path.extname(new URL(url).pathname) || '.bin';
  const tmpPath = path.join(tmpDir, `qwebek-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'Media download failed');
      return null;
    }
    const buf = await res.arrayBuffer();
    fs.writeFileSync(tmpPath, Buffer.from(buf));
    return tmpPath;
  } catch (err) {
    logger.warn({ err, url }, 'Media download error');
    return null;
  }
}

/** Delete temp file. Ignores errors. */
export function deleteTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}
