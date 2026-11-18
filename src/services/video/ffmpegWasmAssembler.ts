import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type { CameraMotionType, VideoScene } from "../../types/jarvis";

export interface WasmAssemblyProgress {
  stage:
    | "loading_core"
    | "preparing_media"
    | "animating_scenes"
    | "merging_audio_video"
    | "verifying_mp4";
  label: string;
  percent: number;
}

export interface AssembleVideoWasmInput {
  scenes: VideoScene[];
  audioSource: string | Blob | Uint8Array;
  expectedAudioDurationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (progress: WasmAssemblyProgress) => void;
}

export interface AssembleVideoWasmResult {
  blob: Blob;
  objectUrl: string;
  audioDurationSec: number;
  videoDurationSec: number;
  width: number;
  height: number;
  frameCount: number;
  engine: "ffmpeg.wasm";
}

const TRANSITION_TYPES = ["fade", "wipeleft", "slideright", "circleopen"];

let sharedFfmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
let activeAssemblyQueue: Promise<unknown> = Promise.resolve();

async function getLoadedFfmpeg(
  onProgress?: (progress: WasmAssemblyProgress) => void
): Promise<FFmpeg> {
  if (sharedFfmpeg?.loaded) {
    return sharedFfmpeg;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      onProgress?.({
        stage: "loading_core",
        label: "Chargement du moteur FFmpeg.wasm…",
        percent: 5,
      });

      const ffmpeg = new FFmpeg();
      const coreURL = await toBlobURL(
        "/api/ffmpeg-core/ffmpeg-core.js",
        "text/javascript"
      );
      const wasmURL = await toBlobURL(
        "/api/ffmpeg-core/ffmpeg-core.wasm",
        "application/wasm"
      );

      await ffmpeg.load({ coreURL, wasmURL });
      sharedFfmpeg = ffmpeg;
      return ffmpeg;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }

  return loadPromise;
}

async function resolveBinaryInput(
  source: string | Blob | Uint8Array
): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    return source;
  }
  if (source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer());
  }
  const resp = await fetch(source);
  if (!resp.ok) {
    throw new Error(
      `Impossible de charger la ressource média (${resp.status}) : ${source}`
    );
  }
  return new Uint8Array(await resp.arrayBuffer());
}

export async function measureAudioDurationSec(
  audioBytes: Uint8Array,
  fallbackSec?: number
): Promise<number> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (AudioCtx) {
    const ctx = new AudioCtx();
    try {
      const copy = audioBytes.slice().buffer;
      const decoded = await ctx.decodeAudioData(copy);
      if (Number.isFinite(decoded.duration) && decoded.duration > 0.2) {
        return decoded.duration;
      }
    } catch {
      // Fallback to HTMLAudioElement below
    } finally {
      void ctx.close().catch(() => {});
    }
  }

  // Fallback via HTMLAudioElement metadata
  const blobUrl = URL.createObjectURL(
    new Blob([audioBytes.slice()], { type: "audio/mpeg" })
  );
  try {
    const dur = await new Promise<number>((resolve, reject) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0.2) {
          resolve(audio.duration);
        } else {
          reject(new Error("Durée audio indétectable."));
        }
      };
      audio.onerror = () =>
        reject(new Error("Erreur de lecture des métadonnées audio."));
      audio.src = blobUrl;
    });
    return dur;
  } catch {
    if (fallbackSec && fallbackSec > 0.2) {
      return fallbackSec;
    }
    throw new Error(
      "Impossible de déterminer la durée exacte de la piste audio générée."
    );
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function probeMp4Metadata(
  objectUrl: string
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const duration = Number(video.duration) || 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      cleanup();
      if (width <= 0 || height <= 0 || duration <= 0) {
        reject(
          new Error(
            "Le fichier MP4 assemblé par FFmpeg.wasm ne contient aucune piste vidéo lisible."
          )
        );
        return;
      }
      resolve({ duration, width, height });
    };

    video.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Impossible de lire le fichier MP4 généré par FFmpeg.wasm."
        )
      );
    };

    video.src = objectUrl;
  });
}

function buildWasmZoompanFilter(
  motion: CameraMotionType | undefined,
  durationSec: number,
  width: number,
  height: number,
  fps: number
): string {
  const frames = Math.max(24, Math.round(durationSec * fps));
  const oversampleW = Math.round(width * 1.25);
  const oversampleH = Math.round(height * 1.25);

  let zoomExpr = "";
  switch (motion) {
    case "zoom_out":
      zoomExpr = `zoompan=z='1.15-0.15*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`;
      break;
    case "pan_right":
      zoomExpr = `zoompan=z='1.12':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`;
      break;
    case "pan_left":
      zoomExpr = `zoompan=z='1.12':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`;
      break;
    case "zoom_in":
    default:
      zoomExpr = `zoompan=z='1.0+0.15*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps}`;
      break;
  }

  return [
    `scale=${oversampleW}:${oversampleH}:force_original_aspect_ratio=increase`,
    `crop=${oversampleW}:${oversampleH}`,
    "setsar=1",
    zoomExpr,
    "format=yuv420p",
  ].join(",");
}

async function runAssemblySerial(
  input: AssembleVideoWasmInput
): Promise<AssembleVideoWasmResult> {
  const {
    scenes,
    audioSource,
    expectedAudioDurationSec,
    width = 1280,
    height = 720,
    fps = 24,
    onProgress,
  } = input;

  if (scenes.length === 0) {
    throw new Error("Aucune scène visuelle fournie pour l'assemblage FFmpeg.wasm.");
  }

  const ffmpeg = await getLoadedFfmpeg(onProgress);

  onProgress?.({
    stage: "preparing_media",
    label: "Chargement des visuels et de la piste audio…",
    percent: 12,
  });

  const audioBytes = await resolveBinaryInput(audioSource);
  const exactAudioDuration = await measureAudioDurationSec(
    audioBytes,
    expectedAudioDurationSec
  );
  const exactAudioStr = exactAudioDuration.toFixed(3);

  const sceneBuffers: Uint8Array[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const url = scenes[i].previewUrl;
    if (!url) {
      throw new Error(
        `La scène ${scenes[i].index} ne possède pas d'image source exploitable.`
      );
    }
    sceneBuffers.push(await resolveBinaryInput(url));
  }

  const createdVirtualFiles: string[] = [];

  const progressHandler = ({ progress }: { progress: number }) => {
    const safeP = Math.max(0, Math.min(1, progress));
    onProgress?.({
      stage: "merging_audio_video",
      label: "Fusion vidéo + narration audio en cours…",
      percent: Math.round(70 + safeP * 22),
    });
  };

  try {
    await ffmpeg.writeFile("narration.mp3", audioBytes);
    createdVirtualFiles.push("narration.mp3");

    // Calculate per-scene animated clip durations so sum(clips) - transitions === exactAudioDuration (+ small safety clone headroom)
    const transitionSec =
      scenes.length > 1 && exactAudioDuration >= scenes.length * 1.4 ? 0.4 : 0;
    const totalNeededVideoSpan =
      exactAudioDuration + Math.max(0, scenes.length - 1) * transitionSec;

    const rawWeights = scenes.map((s) => Math.max(1, s.durationSec || 1));
    const totalWeight = rawWeights.reduce((acc, w) => acc + w, 0);

    const clipDurations = rawWeights.map((w, idx) => {
      const share = (w / totalWeight) * totalNeededVideoSpan;
      // Add slight headroom on last scene before final trim so audio never outruns video
      return idx === scenes.length - 1
        ? Math.max(1.2, share + 0.15)
        : Math.max(1.2, share);
    });

    const clipFiles: string[] = [];

    // Step 1: Animate each scene image using zoompan camera motion
    for (let i = 0; i < scenes.length; i++) {
      const idxPad = String(i + 1).padStart(2, "0");
      const imgFile = `scene_${idxPad}.png`;
      const clipFile = `clip_${idxPad}.mp4`;
      const clipDurStr = clipDurations[i].toFixed(3);

      onProgress?.({
        stage: "animating_scenes",
        label: `Animation caméra scène ${i + 1}/${scenes.length}…`,
        percent: Math.round(18 + ((i + 1) / scenes.length) * 48),
      });

      await ffmpeg.writeFile(imgFile, sceneBuffers[i]);
      createdVirtualFiles.push(imgFile);

      const vf = buildWasmZoompanFilter(
        scenes[i].cameraMotion,
        clipDurations[i],
        width,
        height,
        fps
      );

      const exitCode = await ffmpeg.exec([
        "-y",
        "-i",
        imgFile,
        "-vf",
        vf,
        "-r",
        String(fps),
        "-t",
        clipDurStr,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-an",
        clipFile,
      ]);

      if (exitCode !== 0) {
        throw new Error(
          `FFmpeg.wasm a échoué lors de l'animation de la scène ${i + 1} (code ${exitCode}).`
        );
      }

      createdVirtualFiles.push(clipFile);
      clipFiles.push(clipFile);
    }

    // Step 2: Merge animated clips + narration audio, enforcing MP4 duration === audio track duration
    onProgress?.({
      stage: "merging_audio_video",
      label: "Synchronisation audio/vidéo et encodage MP4…",
      percent: 70,
    });
    ffmpeg.on("progress", progressHandler);

    const execArgs: string[] = ["-y"];
    for (const cf of clipFiles) {
      execArgs.push("-i", cf);
    }
    execArgs.push("-i", "narration.mp3");

    const filterParts: string[] = [];
    if (clipFiles.length === 1) {
      filterParts.push(
        `[0:v]tpad=stop_mode=clone:stop_duration=3,trim=duration=${exactAudioStr},setpts=PTS-STARTPTS,format=yuv420p[vout]`
      );
    } else {
      let prevLabel = "0:v";
      let cumulative = clipDurations[0];

      if (transitionSec > 0) {
        for (let i = 1; i < clipFiles.length; i++) {
          const offset = Math.max(0.2, cumulative - transitionSec);
          const nextLabel = i === clipFiles.length - 1 ? "vx" : `v${i}`;
          const tr = TRANSITION_TYPES[(i - 1) % TRANSITION_TYPES.length];
          filterParts.push(
            `[${prevLabel}][${i}:v]xfade=transition=${tr}:duration=${transitionSec.toFixed(
              2
            )}:offset=${offset.toFixed(3)}[${nextLabel}]`
          );
          prevLabel = nextLabel;
          cumulative += clipDurations[i] - transitionSec;
        }
      } else {
        const inputs = clipFiles.map((_, idx) => `[${idx}:v]`).join("");
        filterParts.push(`${inputs}concat=n=${clipFiles.length}:v=1:a=0[vx]`);
        prevLabel = "vx";
      }

      filterParts.push(
        `[${prevLabel}]tpad=stop_mode=clone:stop_duration=3,trim=duration=${exactAudioStr},setpts=PTS-STARTPTS,format=yuv420p[vout]`
      );
    }

    const audioIdx = clipFiles.length;
    execArgs.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[vout]",
      "-map",
      `${audioIdx}:a`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      exactAudioStr,
      "-movflags",
      "+faststart",
      "jarvis_final.mp4"
    );

    const mergeExit = await ffmpeg.exec(execArgs);
    if (mergeExit !== 0) {
      throw new Error(
        `FFmpeg.wasm a échoué lors de la fusion audio/vidéo (code ${mergeExit}).`
      );
    }
    createdVirtualFiles.push("jarvis_final.mp4");

    onProgress?.({
      stage: "verifying_mp4",
      label: "Vérification de la durée finale du MP4…",
      percent: 95,
    });

    const outData = await ffmpeg.readFile("jarvis_final.mp4");
    const mp4Bytes =
      outData instanceof Uint8Array
        ? outData
        : new TextEncoder().encode(outData);

    if (mp4Bytes.byteLength < 5000) {
      throw new Error(
        "Le fichier MP4 produit par FFmpeg.wasm est vide ou corrompu."
      );
    }

    const blob = new Blob([mp4Bytes.slice()], { type: "video/mp4" });
    const objectUrl = URL.createObjectURL(blob);

    const meta = await probeMp4Metadata(objectUrl);
    const frameCount = Math.max(1, Math.round(meta.duration * fps));

    onProgress?.({
      stage: "verifying_mp4",
      label: "MP4 assemblé et synchronisé avec la piste audio.",
      percent: 100,
    });

    return {
      blob,
      objectUrl,
      audioDurationSec: Number(exactAudioDuration.toFixed(2)),
      videoDurationSec: Number(meta.duration.toFixed(2)),
      width: meta.width,
      height: meta.height,
      frameCount,
      engine: "ffmpeg.wasm",
    };
  } finally {
    ffmpeg.off("progress", progressHandler);
    for (const file of createdVirtualFiles) {
      await ffmpeg.deleteFile(file).catch(() => {});
    }
  }
}

/**
 * Assemble animated scene visuals and generated audio narration into a single MP4
 * via FFmpeg.wasm, guaranteeing the final MP4 total duration matches the audio track.
 */
export function assembleVideoWithFfmpegWasm(
  input: AssembleVideoWasmInput
): Promise<AssembleVideoWasmResult> {
  const next = activeAssemblyQueue.then(
    () => runAssemblySerial(input),
    () => runAssemblySerial(input)
  );
  activeAssemblyQueue = next.catch(() => {});
  return next;
}
