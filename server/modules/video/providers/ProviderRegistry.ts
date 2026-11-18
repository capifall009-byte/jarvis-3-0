import type { VideoProvider, VideoProviderInfo } from "./VideoProvider.ts";
import { HuggingFaceVideoProvider } from "./HuggingFaceVideoProvider.ts";

const providers: VideoProvider[] = [new HuggingFaceVideoProvider()];

export function listVideoProviders(): VideoProvider[] {
  return providers;
}

export function getVideoProvider(id: string): VideoProvider | null {
  return providers.find((p) => p.id === id) ?? null;
}

export function listVideoProviderInfos(): VideoProviderInfo[] {
  return providers.map((p) => ({
    id: p.id,
    name: p.name,
    configured: p.isConfigured(),
    requires: p.requires,
    notes: p.notes,
    supportsTextToVideo: p.supportsTextToVideo,
    supportsImageToVideo: p.supportsImageToVideo,
  }));
}