/**
 * Voix off et ambiances de « JOUR 1 · Ne réponds pas ».
 * Usage : node remotion/scripts/generate-serial-audio.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/serial/audio");
const VOICE = "fr-FR-DeniseNeural";

const LINES = [
  { file: "s1.mp3", text: "Il est deux heures quarante-sept. Ton téléphone sonne." },
  { file: "s2.mp3", text: "L'appelant affiche ton propre numéro." },
  { file: "s3.mp3", text: "Trois secondes avant, tu t'es envoyé un message." },
  { file: "s4.mp3", text: "Il disait : ne réponds pas." },
  { file: "s5.mp3", text: "Le message était daté de demain." },
  { file: "s6.mp3", text: "La sonnerie s'arrête. Puis recommence." },
  { file: "s7.mp3", text: "Cette fois, elle vient de l'autre côté de la porte." },
  { file: "s8.mp3", text: "Vote : répondre, ou laisser sonner. Abonne-toi pour le jour deux." },
];

const FFMPEG =
  process.platform === "win32"
    ? path.resolve(
        __dirname,
        "../../node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe"
      )
    : "ffmpeg";

function runFfmpeg(args) {
  execFileSync(FFMPEG, ["-y", ...args], { stdio: "inherit" });
}

async function synthesize(line) {
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: 10_000,
    synthesisTimeoutMs: 30_000,
  });
  try {
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(line.text, { rate: "-5%", pitch: "-2Hz" });
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw new Error("flux audio vide");
    await writeFile(path.join(OUT_DIR, line.file), buffer);
    console.log(`✓ ${line.file} (${buffer.length} octets)`);
  } finally {
    try {
      tts.close();
    } catch {
      /* ignore */
    }
  }
}

await mkdir(OUT_DIR, { recursive: true });

for (const line of LINES) {
  await synthesize(line);
}

// Nappe : deux sinusoïdes graves. Le fondu est appliqué dans Serial.tsx.
runFfmpeg([
  "-f", "lavfi", "-i", "sine=frequency=55:duration=48",
  "-f", "lavfi", "-i", "sine=frequency=82.41:duration=48",
  "-filter_complex",
  "[0:a]volume=0.4[a];[1:a]volume=0.16[b];[a][b]amix=inputs=2",
  "-c:a", "libmp3lame", "-b:a", "96k",
  path.join(OUT_DIR, "ambient.mp3"),
]);
console.log("✓ ambient.mp3");

// Sonnerie bitonale 450/480 Hz (battement naturel), 1,6 s.
// L'enveloppe est appliquée dans Serial.tsx (filtres afade/tremolo indisponibles ici).
runFfmpeg([
  "-f", "lavfi", "-i", "sine=frequency=450:duration=1.6",
  "-f", "lavfi", "-i", "sine=frequency=480:duration=1.6",
  "-filter_complex",
  "[0:a][1:a]amix=inputs=2,volume=0.5",
  "-c:a", "libmp3lame", "-b:a", "96k",
  path.join(OUT_DIR, "ring.mp3"),
]);
console.log("✓ ring.mp3");

console.log(`\nAudio généré dans ${OUT_DIR}`);
