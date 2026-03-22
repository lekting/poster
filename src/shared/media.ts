import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { logger } from './logger.js';

const MAX_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB

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
  const parsedUrl = new URL(url);
  const ext = path.extname(parsedUrl.pathname) || '.bin';
  const tmpPath = path.join(tmpDir, `qwebek-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, 'Media download failed');
      return null;
    }

    const contentLength = Number(res.headers.get('content-length') || '0');
    if (contentLength > MAX_DOWNLOAD_SIZE) {
      logger.warn({ url, contentLength, maxSize: MAX_DOWNLOAD_SIZE }, 'Media file too large, skipping');
      return null;
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_DOWNLOAD_SIZE) {
      logger.warn({ url, size: buf.byteLength, maxSize: MAX_DOWNLOAD_SIZE }, 'Media file too large');
      return null;
    }

    await fs.writeFile(tmpPath, Buffer.from(buf));
    return tmpPath;
  } catch (err) {
    logger.warn({ err, url }, 'Media download error');
    // Clean up partial file if it was created
    await fs.unlink(tmpPath).catch(() => {});
    return null;
  }
}

/** Delete temp file. Ignores errors. */
export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore — file may already be gone
  }
}
