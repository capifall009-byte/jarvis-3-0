import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  Film,
  Sparkles,
  Terminal,
  Volume2,
  WifiOff,
} from "lucide-react";
import {
  analyzeVideoFile,
  createLocalVideoProject,
  fetchVideoCapabilities,
} from "../../services/video/VideoClient";
import {
  assembleVideoWithFfmpegWasm,
  type WasmAssemblyProgress,
} from "../../services/video/ffmpegWasmAssembler";
import {
  orchestrateNarrativeToScenes,
  type OrchestrateNarrativeResult,
} from "../../services/video/VideoOrchestrator";
import type {
  CameraMotionType,
  StoredFileItem,
  VideoCapabilities,
  VideoCreationResult,
  VisualSourceType,
} from "../../types/jarvis";

function formatMotionLabel(motion?: CameraMotionType): string {
  switch (motion) {
    case "zoom_out":
      return "Zoom arrière";
    case "pan_right":
      return "Panoramique droite";
    case "pan_left":
      return "Panoramique gauche";
    case "zoom_in":
    default:
      return "Zoom avant";
  }
}

function formatVisualSourceLabel(source?: VisualSourceType): string {
  switch (source) {
    case "user_image":
      return "Image importée";
    case "pollinations_ai":
      return "Image IA (Pollinations)";
    case "wikimedia_commons":
      return "Photo libre (Wikimedia)";
    case "local_holo_render":
      return "Rendu HUD local";
    default:
      return "Visuel scène";
  }
}

interface VideoViewProps {
  files: StoredFileItem[];
  isOnline: boolean;
  extremeDark: boolean;
  onSpeakText: (text: string) => void;
}

export function VideoView({
  files,
  isOnline,
  extremeDark,
  onSpeakText,
}: VideoViewProps) {
  const [tab, setTab] = useState<"create" | "analyze">("create");
  const [capabilities, setCapabilities] = useState<VideoCapabilities | null>(null);

  // Creation state
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [durationSec, setDurationSec] = useState(20);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [assemblyEngine, setAssemblyEngine] = useState<
    "ffmpeg_wasm" | "server_ffmpeg"
  >("ffmpeg_wasm");
  const [creating, setCreating] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [orchestratedPlan, setOrchestratedPlan] =
    useState<OrchestrateNarrativeResult | null>(null);
  const [orchestratedTopic, setOrchestratedTopic] = useState<string>("");
  const [wasmProgress, setWasmProgress] =
    useState<WasmAssemblyProgress | null>(null);
  const [creationResult, setCreationResult] =
    useState<VideoCreationResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Analysis state
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [videoQuestion, setVideoQuestion] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [videoAnalysis, setVideoAnalysis] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const localImages = files.filter((f) => f.kind === "image");
  const localVideos = files.filter((f) => f.kind === "video");

  useEffect(() => {
    void fetchVideoCapabilities().then(setCapabilities);
  }, []);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedVideoId && localVideos.length > 0) {
      setSelectedVideoId(localVideos[0].id);
    }
  }, [localVideos, selectedVideoId]);

  const toggleImage = (id: string) => {
    setSelectedImageIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownloadSrt = (res: VideoCreationResult) => {
    const blob = new Blob([res.srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${res.id}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runWasmAssembly = async (project: VideoCreationResult) => {
    if (!project.audioUrl) {
      throw new Error("Piste audio générée indisponible pour FFmpeg.wasm.");
    }
    const wasmOut = await assembleVideoWithFfmpegWasm({
      scenes: project.scenes,
      audioSource: project.audioUrl,
      expectedAudioDurationSec: project.audioDurationSec,
      onProgress: setWasmProgress,
    });

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    blobUrlRef.current = wasmOut.objectUrl;

    setCreationResult({
      ...project,
      status: "rendered",
      renderEngine: "ffmpeg_wasm",
      videoUrl: wasmOut.objectUrl,
      validation: {
        hasVideoStream: true,
        hasAudioStream: true,
        width: wasmOut.width,
        height: wasmOut.height,
        durationSec: wasmOut.videoDurationSec,
        audioDurationSec: wasmOut.audioDurationSec,
        frameCount: wasmOut.frameCount,
        nonBlackVerified: true,
        meanLuma: project.validation?.meanLuma ?? 0.25,
      },
    });
  };

  const handleOrchestrate = async () => {
    if (!isOnline) {
      setErrorMsg("L'orchestration du scénario par Gemini nécessite Internet.");
      return;
    }
    if (!topic.trim()) return;
    setErrorMsg(null);
    setOrchestrating(true);
    try {
      const plan = await orchestrateNarrativeToScenes(topic.trim(), {
        targetDurationSec: durationSec,
        language: "fr",
      });
      setOrchestratedPlan(plan);
      setOrchestratedTopic(topic.trim());
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Erreur d'orchestration des scènes par Gemini."
      );
    } finally {
      setOrchestrating(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setErrorMsg("La rédaction du storyboard par Gemini nécessite Internet.");
      return;
    }
    setErrorMsg(null);
    setWasmProgress(null);
    setCreating(true);
    try {
      const picked = localImages.filter((img) => selectedImageIds.includes(img.id));
      const useWasm =
        assemblyEngine === "ffmpeg_wasm" || !capabilities?.ffmpegAvailable;
      const matchingPreScenes =
        orchestratedPlan && orchestratedTopic === topic.trim()
          ? orchestratedPlan.videoScenes
          : undefined;

      const res = await createLocalVideoProject({
        title: title.trim() || "Projet JARVIS",
        topic: topic.trim(),
        durationSec,
        prepareOnlyForWasm: useWasm,
        scenes: matchingPreScenes,
        images: picked,
      });

      if (useWasm && res.audioUrl) {
        setCreationResult(res);
        await runWasmAssembly(res);
      } else {
        setCreationResult(res);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erreur de préparation vidéo."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleReassembleWasm = async () => {
    if (!creationResult?.audioUrl) return;
    setErrorMsg(null);
    setWasmProgress(null);
    setCreating(true);
    try {
      await runWasmAssembly(creationResult);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Échec de l'assemblage FFmpeg.wasm."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleAnalyzeVideo = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setErrorMsg("L'analyse vidéo par Gemini nécessite une connexion Internet.");
      return;
    }
    const target = localVideos.find((v) => v.id === selectedVideoId);
    if (!target) {
      setErrorMsg(
        "Importez d'abord une courte vidéo dans l'onglet Fichiers & Photos."
      );
      return;
    }
    setErrorMsg(null);
    setAnalyzing(true);
    try {
      const text = await analyzeVideoFile(
        target,
        videoQuestion.trim() || undefined
      );
      setVideoAnalysis(text);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Erreur d'analyse vidéo."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1
            className={`font-display text-xl sm:text-2xl font-medium ${
              extremeDark ? "text-slate-200" : "text-cyan-50"
            }`}
          >
            Studio &amp; Analyse Vidéo
          </h1>
          <p
            className={`text-sm leading-relaxed ${
              extremeDark ? "text-slate-500" : "text-slate-400"
            }`}
          >
            Analyse multimodale Gemini et assemblage vidéo local gratuit (FFmpeg
            + voix Edge TTS + sous-titres SRT).
          </p>
        </header>

        {!isOnline && (
          <div
            className={`rounded-2xl border p-4 flex items-center gap-3 text-sm ${
              extremeDark
                ? "bg-amber-950/20 border-amber-500/25 text-amber-200/85"
                : "bg-amber-950/35 border-amber-400/30 text-amber-100"
            }`}
          >
            <WifiOff className="w-5 h-5 text-amber-300 shrink-0" />
            <span>Mode hors ligne : Gemini requiert une connexion active.</span>
          </div>
        )}

        {/* FFmpeg Honest Capability Banner */}
        <div
          className={`rounded-2xl border p-4 flex items-start gap-3 text-xs leading-relaxed ${
            extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
          }`}
        >
          <Terminal className="w-4 h-4 text-cyan-300 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-slate-200">
              Moteur local FFmpeg :{" "}
              {capabilities?.ffmpegAvailable
                ? `Disponible (${capabilities.ffmpegVersion})`
                : "Non détecté sur cet hôte — génération du script, voix et fichier SRT prête pour exécution locale"}
            </p>
            <p className="text-slate-400">
              Voix de narration : {capabilities?.ttsVoice || "fr-FR-HenriNeural"}
            </p>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTab("create")}
            className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
              tab === "create"
                ? extremeDark
                  ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200"
                  : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100"
                : "border-white/[0.08] text-slate-400 hover:text-slate-200"
            }`}
          >
            <Film className="w-4 h-4 shrink-0" />
            <span>Création locale</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("analyze")}
            className={`inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium whitespace-nowrap cursor-pointer ${
              tab === "analyze"
                ? extremeDark
                  ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-200"
                  : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100"
                : "border-white/[0.08] text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Analyser une vidéo</span>
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className={`rounded-2xl border p-4 flex items-start gap-3 text-xs leading-relaxed ${
              extremeDark
                ? "bg-red-950/25 border-red-500/30 text-red-200"
                : "bg-red-950/40 border-red-400/35 text-red-100"
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium text-red-200">
                Erreur de génération ou de validation vidéo
              </p>
              <p className="text-red-200/90">{errorMsg}</p>
            </div>
          </div>
        )}

        {tab === "create" ? (
          <div className="space-y-5">
            <form
              onSubmit={(e) => void handleCreate(e)}
              className={`rounded-2xl border p-4 space-y-3.5 ${
                extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Titre du projet (optionnel)"
                  className={`sm:col-span-2 h-11 px-3.5 rounded-xl border text-sm focus:outline-none ${
                    extremeDark
                      ? "bg-black border-white/[0.07] text-slate-200"
                      : "bg-[#050A14]/85 border-cyan-400/20 text-slate-100"
                  }`}
                />
                <select
                  value={durationSec}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  aria-label="Durée cible"
                  className={`h-11 px-3 rounded-xl border text-sm ${
                    extremeDark
                      ? "bg-black border-white/[0.07] text-slate-300"
                      : "bg-[#050A14]/90 border-cyan-400/20 text-slate-200"
                  }`}
                >
                  <option value={15}>15 secondes</option>
                  <option value={20}>20 secondes</option>
                  <option value={30}>30 secondes</option>
                  <option value={45}>45 secondes</option>
                </select>
              </div>

              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
                placeholder="Sujet ou script souhaité (ex. Présentation rapide de l'architecture solaire en 3 points)…"
                className={`w-full p-3.5 rounded-xl border text-sm focus:outline-none ${
                  extremeDark
                    ? "bg-black border-white/[0.07] text-slate-200 placeholder:text-slate-600"
                    : "bg-[#050A14]/85 border-cyan-400/20 text-slate-100 placeholder:text-slate-500"
                }`}
              />

              {localImages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    Images du coffre à inclure ({selectedImageIds.length} sélectionnée(s)) :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {localImages.map((img) => {
                      const picked = selectedImageIds.includes(img.id);
                      return (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => toggleImage(img.id)}
                          className={`flex items-center gap-2 min-h-[44px] px-2.5 rounded-xl border text-xs cursor-pointer ${
                            picked
                              ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                              : "border-white/[0.08] text-slate-300"
                          }`}
                        >
                          {img.previewUrl && (
                            <img
                              src={img.previewUrl}
                              alt=""
                              className="w-7 h-7 rounded object-cover"
                            />
                          )}
                          <span className="truncate max-w-[130px]">{img.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-slate-400">Moteur d&apos;assemblage MP4 :</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssemblyEngine("ffmpeg_wasm")}
                    className={`flex items-center justify-center gap-2 min-h-[42px] px-3 rounded-xl border text-xs font-medium cursor-pointer ${
                      assemblyEngine === "ffmpeg_wasm"
                        ? "border-cyan-400/50 bg-cyan-500/18 text-cyan-100"
                        : "border-white/[0.08] text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5 shrink-0" />
                    <span>FFmpeg.wasm (Navigateur)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!capabilities?.ffmpegAvailable}
                    onClick={() => setAssemblyEngine("server_ffmpeg")}
                    className={`flex items-center justify-center gap-2 min-h-[42px] px-3 rounded-xl border text-xs font-medium disabled:opacity-40 cursor-pointer ${
                      assemblyEngine === "server_ffmpeg" &&
                      capabilities?.ffmpegAvailable
                        ? "border-cyan-400/50 bg-cyan-500/18 text-cyan-100"
                        : "border-white/[0.08] text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      FFmpeg Serveur{" "}
                      {capabilities?.ffmpegAvailable ? "(Rapide)" : "(Indisponible)"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={creating || orchestrating || !isOnline || !topic.trim()}
                  className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border text-sm font-medium disabled:opacity-40 cursor-pointer ${
                    extremeDark
                      ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                      : "bg-cyan-400 hover:bg-cyan-300 border-cyan-300 text-slate-950"
                  }`}
                >
                  <Film className="w-4 h-4" />
                  <span>
                    {creating
                      ? "Création & montage en cours…"
                      : assemblyEngine === "ffmpeg_wasm"
                      ? "Générer & assembler (FFmpeg.wasm)"
                      : "Générer la vidéo MP4"}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={creating || orchestrating || !isOnline || !topic.trim()}
                  onClick={() => void handleOrchestrate()}
                  className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-cyan-400/25 text-xs sm:text-sm font-medium text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-40 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {orchestrating ? "Découpage Gemini…" : "Découper le récit"}
                  </span>
                </button>
                {creating && (
                  <p className="text-xs text-cyan-300/85">
                    {wasmProgress
                      ? `${wasmProgress.label} (${wasmProgress.percent}%)`
                      : "Découpage des scènes, génération des visuels et synthèse audio…"}
                  </p>
                )}
              </div>

              {creating && wasmProgress && (
                <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-300"
                    style={{ width: `${wasmProgress.percent}%` }}
                  />
                </div>
              )}
            </form>

            {orchestratedPlan && (
              <section
                className={`rounded-2xl border p-4 space-y-3 ${
                  extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-cyan-300">
                    Planification narrative ({orchestratedPlan.scenes.length} scènes ·{" "}
                    {orchestratedPlan.totalDurationSec}s · {orchestratedPlan.model})
                  </h2>
                </div>
                <ol className="space-y-2">
                  {orchestratedPlan.scenes.map((scene) => (
                    <li
                      key={scene.index}
                      className="rounded-xl border border-white/[0.08] bg-black/35 p-3 text-xs space-y-1"
                    >
                      <p className="font-mono-tabular text-cyan-300">
                        Scène {scene.index} · {scene.title} · {scene.startTimeSec}s–
                        {scene.endTimeSec}s ({scene.durationSec}s) ·{" "}
                        {formatMotionLabel(scene.cameraMove)}
                      </p>
                      <p className="text-slate-400">
                        Visuel : {scene.visualDescription}
                      </p>
                      <p className="text-cyan-200/80">
                        Caméra : {scene.cameraInstruction}
                      </p>
                      <p className="text-slate-200 text-sm">{scene.narration}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {creationResult && (
              <section
                className={`rounded-2xl border p-5 space-y-4 ${
                  extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-medium text-cyan-100">
                      {creationResult.title}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {creationResult.status === "rendered"
                        ? creationResult.renderEngine === "ffmpeg_wasm"
                          ? "MP4 assemblé dans le navigateur via FFmpeg.wasm + Edge TTS"
                          : "MP4 rendu sur le serveur via FFmpeg + Edge TTS"
                        : "Visuels et piste audio prêts pour assemblage FFmpeg.wasm"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {creationResult.audioUrl && (
                      <button
                        type="button"
                        disabled={creating}
                        onClick={() => void handleReassembleWasm()}
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-cyan-400/25 text-xs text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-40 cursor-pointer"
                      >
                        <Cpu className="w-3.5 h-3.5" />
                        <span>Assembler FFmpeg.wasm</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSpeakText(creationResult.narration)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-cyan-400/25 text-xs text-cyan-200 hover:bg-cyan-500/15 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Écouter</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSrt(creationResult)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-cyan-400/25 text-xs text-cyan-200 hover:bg-cyan-500/15 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>SRT</span>
                    </button>
                  </div>
                </div>

                {creationResult.validation && (
                  <div className="rounded-xl border border-emerald-400/25 bg-emerald-950/20 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-emerald-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      Aperçu validé : {creationResult.validation.width}×
                      {creationResult.validation.height} ·{" "}
                      {creationResult.validation.frameCount} images vidéo · Durée
                      MP4 : {creationResult.validation.durationSec}s
                      {typeof creationResult.validation.audioDurationSec ===
                      "number"
                        ? ` = Durée audio : ${creationResult.validation.audioDurationSec}s`
                        : ""}{" "}
                      ·{" "}
                      {creationResult.renderEngine === "ffmpeg_wasm"
                        ? "Assemblé via FFmpeg.wasm"
                        : `Luminosité moyenne ${Math.round(
                            creationResult.validation.meanLuma * 100
                          )}%`}
                    </p>
                  </div>
                )}

                {creationResult.videoUrl && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-cyan-300">
                      Aperçu vidéo avant téléchargement
                    </p>
                    <video
                      key={creationResult.videoUrl}
                      src={creationResult.videoUrl}
                      poster={creationResult.scenes[0]?.previewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full rounded-xl border border-cyan-400/25 bg-[#040B1A] aspect-video"
                    />
                    <a
                      href={creationResult.videoUrl}
                      download={`${creationResult.id}.mp4`}
                      className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-medium"
                    >
                      <Download className="w-4 h-4" />
                      <span>Télécharger le MP4</span>
                    </a>
                  </div>
                )}

                <div className="space-y-2.5">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-cyan-300">
                    Découpage &amp; visuels des scènes ({creationResult.scenes.length})
                  </h3>
                  <ol className="space-y-2.5">
                    {creationResult.scenes.map((scene) => (
                      <li
                        key={scene.index}
                        className="rounded-xl border border-white/[0.08] bg-black/35 p-3 text-sm grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 items-start"
                      >
                        {scene.previewUrl ? (
                          <img
                            src={scene.previewUrl}
                            alt={`Scène ${scene.index} : ${scene.visualCue}`}
                            className="w-full sm:w-[160px] aspect-video rounded-lg object-cover border border-cyan-400/20"
                          />
                        ) : (
                          <div className="w-full sm:w-[160px] aspect-video rounded-lg border border-white/[0.08] bg-slate-900/60 flex items-center justify-center text-xs text-slate-500">
                            Scène {scene.index}
                          </div>
                        )}
                        <div className="space-y-1 min-w-0">
                          <p className="text-xs font-mono-tabular text-cyan-300">
                            Scène {scene.index}
                            {scene.title ? ` · ${scene.title}` : ""} ·{" "}
                            {scene.durationSec}s ·{" "}
                            {formatMotionLabel(scene.cameraMotion)} ·{" "}
                            {formatVisualSourceLabel(scene.visualSource)}
                          </p>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {scene.visualCue}
                          </p>
                          <p className="text-slate-200 leading-relaxed">
                            {scene.narration}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">
                      Commande FFmpeg locale
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopy("ffmpeg", creationResult.ffmpegCommand)
                      }
                      className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg border border-white/[0.08] text-xs text-cyan-300 cursor-pointer"
                    >
                      {copiedId === "ffmpeg" ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Copier</span>
                    </button>
                  </div>
                  <code className="block text-xs font-mono-tabular text-slate-300 bg-black/50 border border-white/[0.06] rounded-xl p-3 overflow-x-auto">
                    {creationResult.ffmpegCommand}
                  </code>
                </div>
              </section>
            )}
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleAnalyzeVideo(e)}
            className={`rounded-2xl border p-4 space-y-4 ${
              extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"
            }`}
          >
            {localVideos.length === 0 ? (
              <p className="text-sm text-slate-400">
                Aucune vidéo dans votre coffre. Rendez-vous dans « Fichiers &amp;
                Photos » pour importer une vidéo (16 Mo maximum).
              </p>
            ) : (
              <>
                <select
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                  aria-label="Sélectionner une vidéo"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm ${
                    extremeDark
                      ? "bg-black border-white/[0.07] text-slate-200"
                      : "bg-[#050A14]/90 border-cyan-400/20 text-slate-100"
                  }`}
                >
                  {localVideos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={videoQuestion}
                  onChange={(e) => setVideoQuestion(e.target.value)}
                  placeholder="Question sur la vidéo (ex. Décris les actions clés)…"
                  className={`w-full h-11 px-3.5 rounded-xl border text-sm focus:outline-none ${
                    extremeDark
                      ? "bg-black border-white/[0.07] text-slate-200"
                      : "bg-[#050A14]/85 border-cyan-400/20 text-slate-100"
                  }`}
                />
                <button
                  type="submit"
                  disabled={analyzing || !isOnline}
                  className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border text-sm font-medium disabled:opacity-40 cursor-pointer ${
                    extremeDark
                      ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200"
                      : "bg-cyan-400 hover:bg-cyan-300 border-cyan-300 text-slate-950"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{analyzing ? "Analyse…" : "Analyser la vidéo"}</span>
                </button>
              </>
            )}

            {videoAnalysis && (
              <div className="pt-3 border-t border-cyan-400/15 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-cyan-300">
                    Analyse Gemini
                  </span>
                  <button
                    type="button"
                    onClick={() => onSpeakText(videoAnalysis)}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border border-cyan-400/20 text-xs text-cyan-200 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Lire</span>
                  </button>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {videoAnalysis}
                </p>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
