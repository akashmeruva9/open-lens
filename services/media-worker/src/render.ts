import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderSceneFrame, type Aspect, type Branding, type Scene } from "./scenes.js";

export function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`))));
  });
}

export interface RenderOptions {
  outDir: string;
  name: string;
  scenes: Scene[];
  brand: Branding;
  /** Optional narration audio (wav/mp3). If absent, a silent track is generated. */
  audioPath?: string;
  /** Also emit HLS for mobile playback. */
  hls?: boolean;
  aspect?: Aspect;
}

export interface RenderResult {
  mp4: string;
  thumbnail: string;
  hlsPlaylist?: string;
  durationSeconds: number;
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const { outDir, name, scenes, brand } = opts;
  if (scenes.length === 0) throw new Error("No scenes to render");
  const work = join(outDir, `${name}-frames`);
  await mkdir(work, { recursive: true });

  const listLines: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const file = join(work, `scene-${String(i).padStart(3, "0")}.png`);
    await writeFile(file, renderSceneFrame(scenes[i]!, brand, i, scenes.length, opts.aspect ?? "9:16"));
    listLines.push(`file '${file}'`, `duration ${scenes[i]!.seconds}`);
  }
  // concat demuxer needs the last file repeated
  listLines.push(`file '${join(work, `scene-${String(scenes.length - 1).padStart(3, "0")}.png`)}'`);
  const listPath = join(work, "list.txt");
  await writeFile(listPath, listLines.join("\n"));

  const total = scenes.reduce((s, sc) => s + sc.seconds, 0);
  const mp4 = join(outDir, `${name}.mp4`);
  const audioArgs = opts.audioPath
    ? ["-i", opts.audioPath]
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100"];

  await run("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    ...audioArgs,
    "-t", String(total),
    "-vf", "fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "128k", "-shortest",
    "-movflags", "+faststart",
    mp4,
  ]);

  let hlsPlaylist: string | undefined;
  if (opts.hls) {
    const hlsDir = join(outDir, `${name}-hls`);
    await mkdir(hlsDir, { recursive: true });
    hlsPlaylist = join(hlsDir, "index.m3u8");
    await run("ffmpeg", [
      "-y", "-i", mp4, "-c", "copy",
      "-hls_time", "4", "-hls_playlist_type", "vod",
      "-hls_segment_filename", join(hlsDir, "seg-%03d.ts"),
      hlsPlaylist,
    ]);
  }
  const thumbnail = join(outDir, `${name}-thumb.png`);
  await writeFile(thumbnail, renderSceneFrame(scenes[0]!, brand, 0, scenes.length, opts.aspect ?? "9:16"));
  return { mp4, thumbnail, hlsPlaylist, durationSeconds: total };
}
