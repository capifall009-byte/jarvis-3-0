/**
 * Génère la voix off du Reel (Edge TTS, voix française) dans remotion/public/reel/audio.
 * Usage : node remotion/scripts/generate-audio.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/reel/audio");
const VOICE = "fr-FR-HenriNeural";

const LINES = [
  { file: "01-hook.mp3", text: "Tu utilises l'IA comme un moteur de recherche ?" },
  { file: "02-valeur.mp3", text: "Tu perds quatre-vingts pour cent de sa valeur." },
  { file: "03-code.mp3", text: "Elle code." },
  { file: "04-filme.mp3", text: "Elle filme." },
  { file: "05-publie.mp3", text: "Elle publie." },
  { file: "06-cta.mp3", text: "Dis-moi juste ce que tu veux." },
];

async function synthesize(line) {
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: 10_000,
    synthesisTimeoutMs: 30_000,
  });
  try {
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(line.text, { rate: "+8%", pitch: "-2Hz" });
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
console.log(`\nVoix off générée dans ${OUT_DIR}`);
