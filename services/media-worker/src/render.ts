import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { portraitBox, renderSceneFrame, SIZES, type Aspect, type Branding, type Scene } from "./scenes.js";

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

  const aspect = opts.aspect ?? "9:16";
  const total = scenes.reduce((s, sc) => s + sc.seconds, 0);
  const mp4 = join(outDir, `${name}.mp4`);
  const audioArgs = opts.audioPath
    ? ["-i", opts.audioPath]
    : ["-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100"];

  // With a presenter idle clip: each scene is composited (navy base + looping clip + transparent text overlay).
  // Without one: still frames per scene, as before.
  const listLines: string[] = [];
  const { w: W, h: H } = SIZES[aspect];
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i]!;
    const tag = String(i).padStart(3, "0");
    if (brand.presenterVideo) {
      const overlay = join(work, `overlay-${tag}.png`);
      await writeFile(overlay, renderSceneFrame(sc, brand, i, scenes.length, aspect, true));
      const box = portraitBox(sc.layout === "anchor" ? "anchor" : "split", aspect);
      const seg = join(work, `seg-${tag}.mp4`);
      const offset = ((i * 2.7) % 6).toFixed(2); // stagger so consecutive scenes don't show the same blink
      await run("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", `color=c=0x0b1220:s=${W}x${H}:r=30:d=${sc.seconds}`,
        "-stream_loop", "-1", "-ss", offset, "-i", brand.presenterVideo,
        "-loop", "1", "-framerate", "30", "-t", String(sc.seconds), "-i", overlay,
        "-filter_complex",
        `[1:v]crop=iw:trunc(min(ih\\,iw*4/3)/2)*2:0:(ih-min(ih\\,iw*4/3))/2,scale=${box.w}:${box.h}:force_original_aspect_ratio=increase,crop=${box.w}:${box.h}:(iw-${box.w})/2:(ih-${box.h})*0.15,setsar=1,fps=30[v];` +
          `[0:v][v]overlay=${box.x}:${box.y}[b];[b][2:v]overlay=0:0:format=auto,format=yuv420p[o]`,
        "-map", "[o]", "-t", String(sc.seconds), "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", seg,
      ]);
      listLines.push(`file '${seg}'`);
    } else {
      const file = join(work, `scene-${tag}.png`);
      await writeFile(file, renderSceneFrame(sc, brand, i, scenes.length, aspect));
      listLines.push(`file '${file}'`, `duration ${sc.seconds}`);
    }
  }
  if (!brand.presenterVideo) listLines.push(`file '${join(work, `scene-${String(scenes.length - 1).padStart(3, "0")}.png`)}'`); // concat demuxer needs the last file repeated
  const listPath = join(work, "list.txt");
  await writeFile(listPath, listLines.join("\n"));

  await run("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    ...audioArgs,
    "-t", String(total),
    ...(brand.presenterVideo ? ["-c:v", "copy"] : ["-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]),
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
