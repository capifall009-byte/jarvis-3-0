/**
 * Voix off de « Le Dernier Signal » — 8 répliques, une par scène.
 * Usage : node remotion/scripts/generate-story-audio.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/story/audio");
const VOICE = "fr-FR-HenriNeural";

const LINES = [
  { file: "s1.mp3", text: "Deux mille quatre-vingt-neuf. La Terre avait cessé d'écouter." },
  { file: "s2.mp3", text: "Une seule antenne veillait encore, au bord du silence." },
  { file: "s3.mp3", text: "Chaque nuit, à la même heure, trois secondes." },
  { file: "s4.mp3", text: "Personne ne la croyait." },
  { file: "s5.mp3", text: "Alors, une nuit, elle répondit." },
  { file: "s6.mp3", text: "Le silence dura longtemps." },
  { file: "s7.mp3", text: "Puis quatre secondes arrivèrent." },
  { file: "s8.mp3", text: "Ce n'était pas la fin. C'était le début." },
];

async function synthesize(line) {
  const tts = new MsEdgeTTS({
    connectionTimeoutMs: 10_000,
    synthesisTimeoutMs: 30_000,
  });
  try {
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(line.text, { rate: "-4%", pitch: "-4Hz" });
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
console.log(`\nNarration générée dans ${OUT_DIR}`);
