import type { VideoGenerationResult } from "../../types/jarvis";
import { idbClear, idbDelete, idbGetAll, idbPut } from "../storage/IndexedDbStore";

const STORE = "videoGenerations";

export async function listVideoGenerations(): Promise<VideoGenerationResult[]> {
  const items = await idbGetAll<VideoGenerationResult>(STORE);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveVideoGeneration(item: VideoGenerationResult): Promise<void> {
  await idbPut(STORE, item);
}

export async function removeVideoGeneration(id: string): Promise<void> {
  await idbDelete(STORE, id);
}

export async function clearVideoGenerations(): Promise<void> {
  await idbClear(STORE);
}