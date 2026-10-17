import { loadImage } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderHookFrame } from "./explainer.js";
import { portraitBox, renderSceneFrame, sceneLayout, SIZES, type Aspect, type Branding, type Scene } from "./scenes.js";

export function run(cmd: string, args: string[]): Promise<void> {
  return runCapture(cmd, args).then(() => undefined);
}

/** Run a command; resolves with stdout + stderr (ffprobe/cropdetect output), rejects on a non-zero exit. */
export function runCapture(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve({ stdout: out, stderr: err }) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`))));
  });
}

/** Optional intro: the first `seconds` show a supplied presenter clip (speaking, with its own audio) at a large size,
 *  before the beats start. It is prepended: narration and captions of the script lines start after it. */
export interface HookClip {
  /** Video file (e.g. a Veo clip of the presenter). Its audio track, if any, is used for the intro. */
  path: string;
  /** How much of the clip to use. */
  seconds: number;
  /** What the presenter says in the clip, shown as the intro caption (and added as the first caption cue). */
  text?: string;
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
  /** Optional intro clip (see HookClip). Absent: the video starts straight on the first beat. */
  hook?: HookClip;
}

export interface RenderResult {
  mp4: string;
  thumbnail: string;
  hlsPlaylist?: string;
  durationSeconds: number;
}

async function hasAudio(path: string): Promise<boolean> {
  try {
    const { stdout } = await runCapture("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/** Black-bar crop for generated clips (Veo can return 3:4 content letterboxed in a 9:16 frame). */
async function detectCrop(path: string): Promise<string | undefined> {
  try {
    const { stderr } = await runCapture("ffmpeg", ["-hide_banner", "-t", "2", "-i", path, "-vf", "cropdetect=24:2:0", "-f", "null", "-"]);
    const all = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
    const m = all.at(-1);
    return m ? `crop=${m[1]}:${m[2]}:${m[3]}:${m[4]},` : undefined;
  } catch {
    return undefined;
  }
}

const even = (n: number) => Math.round(n / 2) * 2;

/** Abstract moving background for a line with no picture: dark-blue gradients that drift slowly (free, and say nothing about the story).
 *  Cut into the same shots as a picture would be, each with its own palette and direction. Produces the filter-graph label [amb]. */
export function ambientShots(sceneIndex: number, seconds: number, W: number, H: number): string {
  const palettes = [
    ["0x0b1220", "0x1b3a8c", "0x0d0e12"],
    ["0x0d0e12", "0x14507a", "0x0b1220"],
    ["0x0b1220", "0x2a2f7a", "0x10131a"],
    ["0x10131a", "0x0f5a73", "0x0b1220"],
  ];
  const shots = shotPlan(seconds, sceneIndex === 0);
  const parts = shots.map((d, k) => {
    const n = sceneIndex * 3 + k;
    const [c0, c1, c2] = palettes[n % palettes.length]!;
    const [x0, y0, x1, y1] = [[0, 0, W, H], [W, 0, 0, H], [0, H, W, 0], [W, H, 0, 0]][n % 4]!;
    return `gradients=s=${W}x${H}:c0=${c0}:c1=${c1}:c2=${c2}:x0=${x0}:y0=${y0}:x1=${x1}:y1=${y1}:speed=0.04:d=${d.toFixed(3)}:r=30,format=yuv420p[g${k}]`;
  });
  return `${parts.join(";")};${shots.map((_, k) => `[g${k}]`).join("")}concat=n=${shots.length}:v=1:a=0[amb]`;
}

/** Shot durations for a scene: about every 4 s a hard cut to a new framing of the same picture (a remainder under 2.5 s is merged
 *  into the previous shot). The first scene opens with a short, punchy 2.5 s shot so the video starts moving at once. */
export function shotPlan(seconds: number, first: boolean): number[] {
  const out: number[] = [];
  let left = seconds;
  if (first && seconds > 5) { out.push(2.5); left -= 2.5; }
  const n = Math.max(1, Math.round(left / 4));
  const each = left / n;
  for (let k = 0; k < n; k++) out.push(each);
  return out;
}

/** The picture scaled to 1.5x the frame first, so the crop window can move in whole pixels without jitter. */
const prescale = (W: number, H: number) => `scale=${even(W * 1.5)}:${even(H * 1.5)}:force_original_aspect_ratio=increase,crop=${even(W * 1.5)}:${even(H * 1.5)}`;

/** One shot's slow pan/zoom (Ken Burns). Six framings in rotation, so consecutive shots never repeat; `punch` is a fast push-in for the opening shot. */
export function zoomMove(index: number, seconds: number, W: number, H: number, punch = false): string {
  const frames = Math.max(1, Math.round(seconds * 30));
  const moves = [
    `z='min(1.18,1+0.18*on/${frames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`, // slow push in on the centre
    `z='1.2':x='(iw-iw/zoom)*on/${frames}':y='(ih-ih/zoom)*0.25'`, // drift right, upper third
    `z='max(1,1.18-0.18*on/${frames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`, // pull out from a zoomed frame
    `z='1.2':x='(iw-iw/zoom)*(1-on/${frames})':y='(ih-ih/zoom)*0.75'`, // drift left, lower third
    `z='1.2':x='(iw-iw/zoom)*0.5':y='(ih-ih/zoom)*on/${frames}'`, // drift down
    `z='1.2':x='(iw-iw/zoom)*0.5':y='(ih-ih/zoom)*(1-on/${frames})'`, // drift up
  ];
  const move = punch ? `z='min(1.32,1+0.32*on/${frames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` : moves[index % moves.length]!;
  return `zoompan=${move}:d=1:s=${W}x${H}:fps=30,setsar=1`;
}

/** Filter graph piece: input label -> [img]: the picture cut into shots (see shotPlan), each a different slow move. */
export function pictureShots(inLabel: string, sceneIndex: number, seconds: number, W: number, H: number): string {
  const shots = shotPlan(seconds, sceneIndex === 0);
  const labels = shots.map((_, k) => `[m${k}]`);
  let at = 0;
  const parts = shots.map((d, k) => {
    const part = `[s${k}]trim=start=${at.toFixed(3)}:duration=${d.toFixed(3)},setpts=PTS-STARTPTS,${zoomMove(sceneIndex * 3 + k, d, W, H, sceneIndex === 0 && k === 0)}${labels[k]}`;
    at += d;
    return part;
  });
  const split = shots.length > 1 ? `[ps]split=${shots.length}${shots.map((_, k) => `[s${k}]`).join("")}` : "[ps]null[s0]";
  return `${inLabel}${prescale(W, H)}[ps];${split};${parts.join(";")};${labels.join("")}concat=n=${shots.length}:v=1:a=0[img]`;
}

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const { outDir, name, scenes, brand } = opts;
  if (scenes.length === 0) throw new Error("No scenes to render");
  const work = join(outDir, `${name}-frames`);
  await mkdir(work, { recursive: true });

  const aspect = opts.aspect ?? "9:16";
  const hook = opts.hook && opts.hook.seconds > 0 ? opts.hook : undefined;
  const hookSeconds = hook?.seconds ?? 0;
  const total = scenes.reduce((s, sc) => s + sc.seconds, 0) + hookSeconds;
  const mp4 = join(outDir, `${name}.mp4`);

  // Supplied illustrations are loaded once here so frame drawing stays synchronous.
  for (const sc of scenes) {
    if (sc.imagePath && !sc.image) sc.image = await loadImage(sc.imagePath).catch(() => undefined);
    if (sc.backdropPath && !sc.bgImage) sc.bgImage = await loadImage(sc.backdropPath).catch(() => undefined);
  }

  // Segment mode (one mp4 per scene, concatenated by stream copy) whenever something moves: the presenter idle clip
  // or the hook intro. Otherwise still frames per scene through the concat demuxer, as before.
  const segmentMode = Boolean(brand.presenterVideo || hook);
  const listLines: string[] = [];
  const { w: W, h: H } = SIZES[aspect];
  const encode = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30"];

  if (hook) {
    const overlay = join(work, "overlay-hook.png");
    await writeFile(overlay, renderHookFrame({ text: hook.text, title: brand.title }, brand, aspect, true));
    const box = portraitBox("hook", aspect);
    const bw = even(box.w), bh = even(box.h);
    const crop = (await detectCrop(hook.path)) ?? "";
    const seg = join(work, "seg-hook.mp4");
    await run("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", `color=c=0x0d0e12:s=${W}x${H}:r=30:d=${hookSeconds}`,
      "-i", hook.path,
      "-loop", "1", "-framerate", "30", "-t", String(hookSeconds), "-i", overlay,
      "-filter_complex",
      `[1:v]${crop}scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}:(iw-${bw})/2:(ih-${bh})*0.2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${hookSeconds}[v];` +
        `[0:v][v]overlay=${box.x}:${box.y}[b];[b][2:v]overlay=0:0:format=auto,format=yuv420p[o]`,
      "-map", "[o]", "-t", String(hookSeconds), "-an", ...encode, seg,
    ]);
    listLines.push(`file '${seg}'`);
  }

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i]!;
    const tag = String(i).padStart(3, "0");
    if (brand.presenterVideo) {
      const overlay = join(work, `overlay-${tag}.png`);
      // No picture for this line (and not the end card): a slowly shifting abstract gradient moves under the frame.
      if (sc.beat && sc.beat.kind !== "cta" && sc.beat.kind !== "illustration" && !sc.bgImage) sc.ambient = true;
      await writeFile(overlay, renderSceneFrame(sc, brand, i, scenes.length, aspect, true));
      const box = portraitBox(sceneLayout(sc), aspect);
      const bw = even(box.w), bh = even(box.h);
      const seg = join(work, `seg-${tag}.mp4`);
      const offset = ((i * 2.7) % 6).toFixed(2); // stagger so consecutive scenes don't show the same blink
      // A scene with a picture (its own illustration, or a backdrop behind another card): ffmpeg moves it under the transparent overlay.
      const pic = sc.beat?.kind === "illustration" ? (sc.image ? sc.imagePath : undefined) : sc.bgImage ? sc.backdropPath : undefined;
      const presenter =
        `[1:v]crop=iw:trunc(min(ih\\,iw*4/3)/2)*2:0:(ih-min(ih\\,iw*4/3))/2,scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}:(iw-${bw})/2:(ih-${bh})*0.15,setsar=1,fps=30[v];`;
      await run("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", `color=c=0x0b1220:s=${W}x${H}:r=30:d=${sc.seconds}`,
        "-stream_loop", "-1", "-ss", offset, "-i", brand.presenterVideo,
        "-loop", "1", "-framerate", "30", "-t", String(sc.seconds), "-i", overlay,
        ...(pic ? ["-loop", "1", "-framerate", "30", "-t", String(sc.seconds), "-i", pic] : []),
        "-filter_complex",
        pic
          ? `${presenter}${pictureShots("[3:v]", i, sc.seconds, W, H)};[0:v][img]overlay=0:0[bg];[bg][v]overlay=${box.x}:${box.y}[b];[b][2:v]overlay=0:0:format=auto,format=yuv420p[o]`
          : sc.ambient
            ? `${presenter}${ambientShots(i, sc.seconds, W, H)};[amb][v]overlay=${box.x}:${box.y}[b];[b][2:v]overlay=0:0:format=auto,format=yuv420p[o]`
            : `${presenter}[0:v][v]overlay=${box.x}:${box.y}[b];[b][2:v]overlay=0:0:format=auto,format=yuv420p[o]`,
        "-map", "[o]", "-t", String(sc.seconds), "-an", ...encode, seg,
      ]);
      listLines.push(`file '${seg}'`);
    } else {
      const file = join(work, `scene-${tag}.png`);
      await writeFile(file, renderSceneFrame(sc, brand, i, scenes.length, aspect));
      if (segmentMode) {
        const seg = join(work, `seg-${tag}.mp4`);
        await run("ffmpeg", ["-y", "-loop", "1", "-framerate", "30", "-t", String(sc.seconds), "-i", file, "-an", ...encode, seg]);
        listLines.push(`file '${seg}'`);
      } else listLines.push(`file '${file}'`, `duration ${sc.seconds}`);
    }
  }
  if (!segmentMode) listLines.push(`file '${join(work, `scene-${String(scenes.length - 1).padStart(3, "0")}.png`)}'`); // concat demuxer needs the last file repeated
  const listPath = join(work, "list.txt");
  await writeFile(listPath, listLines.join("\n"));

  // Audio: [hook clip's own audio (or silence) for hookSeconds] + narration. Padded with silence so an appended
  // end card (no narration) keeps its full length.
  let audioArgs: string[];
  if (hook) {
    const mixed = join(work, "audio-with-hook.wav");
    const hookHasAudio = await hasAudio(hook.path);
    const inputs = [
      ...(hookHasAudio ? ["-i", hook.path] : ["-f", "lavfi", "-t", String(hookSeconds), "-i", "anullsrc=channel_layout=mono:sample_rate=44100"]),
      ...(opts.audioPath ? ["-i", opts.audioPath] : ["-f", "lavfi", "-t", String(total - hookSeconds), "-i", "anullsrc=channel_layout=mono:sample_rate=44100"]),
    ];
    const fmt = "aresample=44100,aformat=sample_fmts=s16:channel_layouts=mono";
    await run("ffmpeg", [
      "-y", ...inputs, "-filter_complex",
      `[0:a]atrim=0:${hookSeconds},${fmt},apad=whole_dur=${hookSeconds}[h];[1:a]${fmt}[n];[h][n]concat=n=2:v=0:a=1[out]`,
      "-map", "[out]", mixed,
    ]);
    audioArgs = ["-i", mixed];
  } else {
    audioArgs = opts.audioPath ? ["-i", opts.audioPath] : ["-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100"];
  }

  await run("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    ...audioArgs,
    "-map", "0:v", "-map", "1:a",
    "-t", String(total),
    ...(segmentMode ? ["-c:v", "copy"] : ["-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]),
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,apad",
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
  await writeFile(thumbnail, renderSceneFrame(scenes[0]!, brand, 0, scenes.length, aspect));
  return { mp4, thumbnail, hlsPlaylist, durationSeconds: total };
}
