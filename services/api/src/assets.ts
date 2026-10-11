import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface AssetStore {
  /** Store a local file under key (e.g. story/national-en/video-916.mp4); returns the URL clients use. */
  put(localPath: string, key: string, contentType?: string): Promise<string>;
  /** Local filesystem path for a stored asset URL (for uploads to YouTube etc.), if available. */
  localPath(url: string): string | undefined;
}

/** Dev: copies into DATA_DIR/assets and serves at /assets/... */
export class LocalAssets implements AssetStore {
  constructor(private dir: string) {}
  async put(localPath: string, key: string) {
    const dest = join(this.dir, key);
    await mkdir(dirname(dest), { recursive: true });
    if (localPath !== dest) await copyFile(localPath, dest);
    return `/assets/${key}`;
  }
  localPath(url: string) {
    return url.startsWith("/assets/") ? join(this.dir, url.slice("/assets/".length)) : undefined;
  }
}

/** Prod: uploads to a GCS bucket (uniform public-read for published media) and returns the https URL. */
export class GcsAssets implements AssetStore {
  private cacheDir: string;
  constructor(private bucket: string, cacheDir: string) {
    this.cacheDir = cacheDir;
  }
  async put(localPath: string, key: string, contentType?: string) {
    const { Storage } = await import("@google-cloud/storage");
    await new Storage().bucket(this.bucket).upload(localPath, {
      destination: key,
      contentType,
      metadata: { cacheControl: key.endsWith(".m3u8") ? "no-cache" : "public, max-age=3600" },
    });
    // keep a local copy for publishers that need a file path
    const dest = join(this.cacheDir, key);
    await mkdir(dirname(dest), { recursive: true });
    if (localPath !== dest) await copyFile(localPath, dest);
    return `https://storage.googleapis.com/${this.bucket}/${key}`;
  }
  localPath(url: string) {
    const prefix = `https://storage.googleapis.com/${this.bucket}/`;
    return url.startsWith(prefix) ? join(this.cacheDir, url.slice(prefix.length)) : undefined;
  }
}
