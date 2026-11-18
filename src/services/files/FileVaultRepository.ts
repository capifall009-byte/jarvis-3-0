import type { StoredFileItem, StoredFileKind } from "../../types/jarvis";
import { idbClear, idbDelete, idbGetAll, idbPut } from "../storage/IndexedDbStore";

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function classifyFileKind(mimeType: string, fileName: string): StoredFileKind {
  const lowerMime = mimeType.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (lowerMime.startsWith("image/")) return "image";
  if (lowerMime === "application/pdf" || lowerName.endsWith(".pdf")) return "pdf";
  if (lowerMime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/.test(lowerName)) {
    return "video";
  }
  return "document";
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Impossible de lire ce fichier."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Impossible de lire le document texte."));
    reader.readAsText(file);
  });
}

export async function importLocalFile(file: File): Promise<StoredFileItem> {
  if (file.size > 16 * 1024 * 1024) {
    throw new Error(
      `Le fichier « ${file.name} » dépasse 16 Mo. Réduisez sa taille avant importation.`
    );
  }

  const mimeType = file.type || "application/octet-stream";
  const kind = classifyFileKind(mimeType, file.name);
  const isTextLike =
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    /\.(txt|md|csv|json|xml|log)$/i.test(file.name);

  let base64Data: string | undefined;
  let textContent: string | undefined;
  let previewUrl: string | undefined;

  if (isTextLike) {
    textContent = await readFileAsText(file);
  } else {
    base64Data = await readFileAsBase64(file);
    if (kind === "image") {
      previewUrl = `data:${mimeType};base64,${base64Data}`;
    }
  }

  const item: StoredFileItem = {
    id: createId(),
    name: file.name,
    mimeType: isTextLike && !file.type ? "text/plain" : mimeType,
    size: file.size,
    kind,
    base64Data,
    textContent,
    previewUrl,
    createdAt: Date.now(),
  };

  await idbPut("files", item);
  return item;
}

export async function listStoredFiles(): Promise<StoredFileItem[]> {
  const items = await idbGetAll<StoredFileItem>("files");
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeStoredFile(id: string): Promise<void> {
  await idbDelete("files", id);
}

export async function clearStoredFiles(): Promise<void> {
  await idbClear("files");
}

export async function analyzeStoredFileWithGemini(
  item: StoredFileItem,
  question?: string
): Promise<StoredFileItem> {
  const res = await fetch("/api/files/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: item.name,
      mimeType: item.mimeType,
      base64Data: item.base64Data,
      textContent: item.textContent,
      question,
    }),
  });

  const data = (await res.json()) as { analysis?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Erreur d'analyse (${res.status}).`);
  }

  const updated: StoredFileItem = {
    ...item,
    analysis: data.analysis || "Analyse terminée.",
    analyzedAt: Date.now(),
  };
  await idbPut("files", updated);
  return updated;
}
