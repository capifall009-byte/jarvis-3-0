export interface VideoGenerationInput {
  prompt: string;
  imageBase64?: string;
  imageMimeType?: string;
  durationSec?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  style?: string;
}

export interface VideoGenerationOutput {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  providerJobId?: string;
}

export interface VideoProvider {
  id: string;
  name: string;
  requires: string[];
  notes: string;
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  isConfigured(): boolean;
  generate(input: VideoGenerationInput): Promise<VideoGenerationOutput>;
}

export interface VideoProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  requires: string[];
  notes: string;
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
}