import type { VideoGenerationInput, VideoGenerationOutput, VideoProvider } from "./VideoProvider.ts";
import { InferenceClient } from "@huggingface/inference";

const DEFAULT_MODEL = process.env.HF_VIDEO_MODEL || "tencent/HunyuanVideo";

export class HuggingFaceVideoProvider implements VideoProvider {
  id = "huggingface";
  name = "Hugging Face Inference Providers (@huggingface/inference)";
  requires = ["HF_TOKEN"];
  notes =
    "Génération vidéo réelle via le SDK officiel @huggingface/inference et Hugging Face Inference Providers (texte vers vidéo, modèle tencent/HunyuanVideo). Service pay-as-you-go : crédits mensuels inclus uniquement pour les abonnés PRO/Team/Enterprise. Aucun quota gratuit garanti pour un compte HF gratuit. Le token HF doit avoir la permission 'Inference Providers'. Consultez https://huggingface.co/docs/inference-providers pour les tarifs à jour.";
  supportsTextToVideo = true;
  supportsImageToVideo = false;

  private client: InferenceClient | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.HF_TOKEN && process.env.HF_TOKEN.trim().length > 0);
  }

  private getClient(): InferenceClient {
    if (!this.client) {
      this.client = new InferenceClient(process.env.HF_TOKEN!);
    }
    return this.client;
  }

  async generate(input: VideoGenerationInput): Promise<VideoGenerationOutput> {
    if (!this.isConfigured()) {
      throw new Error(
        "HF_TOKEN non configuré côté serveur. Créez un token Hugging Face (permission 'Inference Providers') et définissez HF_TOKEN. Ce service est payant (pay-as-you-go)."
      );
    }
    if (input.imageBase64) {
      throw new Error(
        "Ce fournisseur ne prend en charge que le texte vers vidéo (pas image vers vidéo)."
      );
    }

    const model = DEFAULT_MODEL;
    const client = this.getClient();

    let buffer: Buffer;

    try {
      // Génération texte vers vidéo via le SDK officiel Hugging Face Inference Providers.
      // Le modèle tencent/HunyuanVideo est tagué "text-to-video" sur le Hugging Face Hub.
      const videoBlob = await client.textToVideo({
        model,
        inputs: input.prompt,
        num_frames: Math.max(8, Math.min(64, Math.round((input.durationSec || 4) * 8))),
      });
      buffer = Buffer.from(await videoBlob.arrayBuffer());
    } catch (err: unknown) {
      // Aucune simulation : si le SDK ou le modèle ne répond pas, une erreur claire est levée.
      throw new Error(
        `Échec de génération vidéo via le SDK @huggingface/inference (modèle ${model}) : ${
          err instanceof Error ? err.message : String(err)
        }. Vérifiez que votre token HF_TOKEN a la permission 'Inference Providers' et que le modèle supporte la génération texte vers vidéo.`
      );
    }

    if (!buffer || buffer.length === 0) {
      throw new Error("Réponse vidéo vide depuis Hugging Face Inference Providers.");
    }

    return {
      buffer,
      mimeType: "video/mp4",
      extension: "mp4",
      providerJobId: model,
    };
  }
}
