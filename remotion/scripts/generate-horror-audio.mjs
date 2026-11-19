/**
 * Voix off froide et ambiances de « JOUR 1 · Le couloir ».
 * Usage : node remotion/scripts/generate-horror-audio.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/horror/audio");
const VOICE = "fr-FR-RemyMultilingualNeural";

const LINES = [
  { file: "s1.mp3", text: "Journal. Jour un. Trois pour cent." },
  { file: "s2.mp3", text: "Les ascenseurs sont arrêtés depuis ce matin." },
  { file: "s3.mp3", text: "À vingt-deux heures, ça a commencé au quatrième étage." },
  { file: "s4.mp3", text: "D'abord un cri. Puis des pas. Beaucoup de pas." },
  { file: "s5.mp3", text: "J'ai éteint la lumière. Je filme depuis le placard." },
  { file: "s6.mp3", text: "Quelqu'un marche. Puis il respire." },
  { file: "s7.mp3", text: "Il vient de dire mon prénom. Je n'ai jamais ouvert cette porte." },
  { file: "s8.mp3", text: "Vote : ouvrir la fenêtre, ou rester caché. À demain." },
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
    // Voix d'homme naturelle, débit posé : ton de journal intime glacé.
    const { audioStream } = tts.toStream(line.text, { rate: "-6%", pitch: "-2Hz" });
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

// Nappe : sinusoïdes très graves, légère dissonance. Fondu appliqué dans Horror.tsx.
runFfmpeg([
  "-f", "lavfi", "-i", "sine=frequency=48:duration=48",
  "-f", "lavfi", "-i", "sine=frequency=71.5:duration=48",
  "-f", "lavfi", "-i", "sine=frequency=97:duration=48",
  "-filter_complex",
  "[0:a]volume=0.45[a];[1:a]volume=0.2[b];[2:a]volume=0.08[c];[a][b][c]amix=inputs=3",
  "-c:a", "libmp3lame", "-b:a", "96k",
  path.join(OUT_DIR, "ambient.mp3"),
]);
console.log("✓ ambient.mp3");

// Deux coups sourds : l'enveloppe double est appliquée dans Horror.tsx.
runFfmpeg([
  "-f", "lavfi", "-i", "sine=frequency=68:duration=1.3",
  "-f", "lavfi", "-i", "sine=frequency=136:duration=1.3",
  "-filter_complex",
  "[0:a]volume=0.6[a];[1:a]volume=0.22[b];[a][b]amix=inputs=2",
  "-c:a", "libmp3lame", "-b:a", "96k",
  path.join(OUT_DIR, "knock.mp3"),
]);
console.log("✓ knock.mp3");

console.log(`\nAudio généré dans ${OUT_DIR}`);
