import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  fetchVideoProviders,
  generateAiVideo,
  generateStoryboard,
  listAiVideoHistory,
} from "../../services/video/VideoGenerationClient";
import {
  listVideoGenerations,
  saveVideoGeneration,
  removeVideoGeneration,
} from "../../services/video/VideoHistoryRepository";
import type {
  StoryboardScene,
  VideoAspectRatio,
  VideoCameraMotion,
  VideoGenerationMode,
  VideoGenerationResult,
  VideoProviderInfo,
  VideoStyle,
} from "../../types/jarvis";

interface AiVideoStudioViewProps {
  isOnline: boolean;
  extremeDark: boolean;
}

const STYLES: { id: VideoStyle; label: string }[] = [
  { id: "realistic", label: "Réaliste" },
  { id: "cinematic", label: "Cinématique" },
  { id: "horror", label: "Horreur" },
  { id: "anime", label: "Anime" },
  { id: "documentary", label: "Documentaire" },
  { id: "football", label: "Football" },
  { id: "fantasy", label: "Fantastique" },
  { id: "ad", label: "Publicité" },
];

const RATIOS: { id: VideoAspectRatio; label: string }[] = [
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "1:1", label: "1:1" },
];

const CAMERAS: { id: VideoCameraMotion; label: string }[] = [
  { id: "static", label: "Statique" },
  { id: "zoom_in", label: "Zoom avant" },
  { id: "zoom_out", label: "Zoom arrière" },
  { id: "pan_right", label: "Panoramique droite" },
  { id: "pan_left", label: "Panoramique gauche" },
  { id: "orbit", label: "Orbite" },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AiVideoStudioView({ isOnline, extremeDark }: AiVideoStudioViewProps) {
  const [mode, setMode] = useState<VideoGenerationMode>("text");
  const [prompt, setPrompt] = useState("");
  const [story, setStory] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(12);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("16:9");
  const [style, setStyle] = useState<VideoStyle>("cinematic");
  const [cameraMotion, setCameraMotion] = useState<VideoCameraMotion>("static");
  const [transitions, setTransitions] = useState(true);
  const [ambiance, setAmbiance] = useState("musique épique et immersive");
  const [voiceover, setVoiceover] = useState(true);
  const [characters, setCharacters] = useState("");

  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [storyboarding, setStoryboarding] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VideoGenerationResult | null>(null);

  const [providers, setProviders] = useState<VideoProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<string>("");
  const [serverHistoryCount, setServerHistoryCount] = useState<number | null>(null);
  const [history, setHistory] = useState<VideoGenerationResult[]>([]);

  const selectedProvider = providers.find((p) => p.id === providerId) ?? providers[0];
  const imageModeSupported = mode !== "image" || selectedProvider?.supportsImageToVideo === true;
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOnline) return;
    void fetchVideoProviders().then(setProviders);
    void listVideoGenerations().then(setHistory);
    void listAiVideoHistory()
      .then((items) => setServerHistoryCount(Array.isArray(items) ? items.length : 0))
      .catch(() => setServerHistoryCount(null));
  }, [isOnline]);

  const handleImagePick = async (file: File | null) => {
    if (!file) return;
    const base64 = await fileToBase64(file);
    setImageBase64(base64);
    setImageMimeType(file.type || "image/png");
    setImageName(file.name);
  };

  const handleStoryboard = async () => {
    if (!isOnline) return;
    setStoryboarding(true);
    setError(null);
    try {
      const effectivePrompt =
        mode === "story" ? story.trim() || prompt.trim() : prompt.trim();
      if (!effectivePrompt) {
        throw new Error("Décris une scène ou une histoire.");
      }
      const built = await generateStoryboard({
        mode,
        prompt: effectivePrompt,
        story: mode === "story" ? story : undefined,
        durationSec,
        aspectRatio,
        style,
        cameraMotion,
        characters,
        voiceover,
      });
      const withIds = built.map((s, i) => ({ ...s, id: `scene-${Date.now()}-${i}` }));
      setScenes(withIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec du storyboard.");
    } finally {
      setStoryboarding(false);
    }
  };

  const handleGenerate = async () => {
    if (!isOnline) return;
    setGenerating(true);
    setError(null);
    setProgress(10);
    try {
      const effectivePrompt =
        mode === "story" ? story.trim() || prompt.trim() : prompt.trim();
      if (!effectivePrompt && mode !== "image") {
        throw new Error("Décris une scène ou une histoire.");
      }
      if (mode === "image" && !imageBase64) {
        throw new Error("Importe une image à animer.");
      }
      if (!imageModeSupported) {
        throw new Error(
          `Le fournisseur sélectionné ne prend pas en charge l'image → vidéo. Choisissez un fournisseur compatible ou passez en texte → vidéo.`
        );
      }
      setProgress(30);
      const res = await generateAiVideo({
        mode,
        prompt: effectivePrompt || "Animer l'image fournie",
        story: mode === "story" ? story : undefined,
        imageBase64: imageBase64 ?? undefined,
        imageMimeType: imageMimeType ?? undefined,
        durationSec,
        aspectRatio,
        style,
        cameraMotion,
        transitions,
        ambiance,
        voiceover,
        characters,
        scenes: scenes.length ? scenes : undefined,
        providerId: providerId || undefined,
      });
      setProgress(90);
      setResult(res);
      if (res.videoUrl) {
        await saveVideoGeneration(res);
        setHistory(await listVideoGenerations());
      }
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la génération vidéo.");
    } finally {
      setGenerating(false);
      setTimeout(() => setProgress(0), 1200);
    }
  };

  const updateScene = (id: string, patch: Partial<StoryboardScene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeScene = (id: string) => {
    setScenes((prev) => prev.filter((s) => s.id !== id));
  };

  const addEmptyScene = () => {
    setScenes((prev) => [
      ...prev,
      {
        id: `scene-${Date.now()}`,
        index: prev.length,
        title: "Nouvelle scène",
        narration: "",
        visualDescription: "",
        imagePrompt: "",
        cameraMotion: "static",
        durationSec: 4,
        transition: "fade",
      },
    ]);
  };

  const panelClass = extremeDark
    ? "bg-black/60 border-white/[0.08]"
    : "jarvis-glass border-cyan-400/20";

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1
                className={`font-display text-xl sm:text-2xl font-medium ${
                  extremeDark ? "text-slate-200" : "text-cyan-50"
                }`}
              >
                Studio Vidéo IA
              </h1>
              <p
                className={`text-sm leading-relaxed ${
                  extremeDark ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Génération vidéo par IA : texte, image ou histoire. Storyboard piloté par Gemini.
              </p>
            </div>
            <Clapperboard className="w-8 h-8 text-cyan-300 shrink-0" />
          </div>
        </header>

        {!isOnline && (
          <div className={`rounded-2xl border p-4 text-sm ${panelClass} text-amber-300`}>
            Hors ligne : le Studio Vidéo IA nécessite Internet.
          </div>
        )}

        {/* Modes */}
        <section className={`rounded-2xl border p-4 space-y-3 ${panelClass}`}>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "text", label: "Texte → Vidéo", icon: Wand2 },
                { id: "image", label: "Image → Vidéo", icon: ImageIcon },
                { id: "story", label: "Histoire → Vidéo", icon: Film },
              ] as Array<{ id: VideoGenerationMode; label: string; icon: any }>
            ).map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`min-h-[40px] px-4 rounded-xl border text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                    mode === m.id
                      ? extremeDark
                        ? "bg-cyan-950/50 border-cyan-500/40 text-cyan-100"
                        : "bg-cyan-500/15 border-cyan-400/35 text-cyan-100"
                      : extremeDark
                      ? "border-white/[0.08] text-slate-300 hover:border-white/[0.16]"
                      : "border-white/[0.08] text-slate-300 hover:border-cyan-400/25"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {m.label}
                </button>
              );
            })}
          </div>

          {mode === "story" ? (
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="Écris ton histoire ici… JARVIS la découpera en scènes."
              rows={5}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm bg-transparent outline-none resize-y ${
                extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
              }`}
            />
          ) : (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                mode === "image"
                  ? "Décris l'animation souhaitée pour l'image…"
                  : "Décris la scène à générer…"
              }
              rows={4}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm bg-transparent outline-none resize-y ${
                extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
              }`}
            />
          )}

          {mode === "image" && (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImagePick(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 cursor-pointer ${
                  extremeDark
                    ? "border-cyan-500/25 text-cyan-300/85 hover:bg-cyan-950/40"
                    : "border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {imageName ? imageName : "Importer une image"}
              </button>
              {imageBase64 && (
                <img
                  src={`data:${imageMimeType};base64,${imageBase64}`}
                  alt="preview"
                  className="max-h-40 rounded-xl border border-white/[0.08]"
                />
              )}
            </div>
          )}
        </section>

        {/* Config */}
        <section className={`rounded-2xl border p-4 space-y-3 ${panelClass}`}>
          <h2 className="font-display text-base font-medium text-cyan-100">Configuration</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-xs text-slate-400 space-y-1">
              Durée (s)
              <input
                type="number"
                min={4}
                max={60}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className={`w-full min-h-[36px] px-2 rounded-lg border text-sm bg-transparent outline-none ${
                  extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                }`}
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              Format
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as VideoAspectRatio)}
                className={`w-full min-h-[36px] px-2 rounded-lg border text-sm bg-transparent outline-none ${
                  extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                }`}
              >
                {RATIOS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              Style
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as VideoStyle)}
                className={`w-full min-h-[36px] px-2 rounded-lg border text-sm bg-transparent outline-none ${
                  extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                }`}
              >
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              Caméra
              <select
                value={cameraMotion}
                onChange={(e) => setCameraMotion(e.target.value as VideoCameraMotion)}
                className={`w-full min-h-[36px] px-2 rounded-lg border text-sm bg-transparent outline-none ${
                  extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                }`}
              >
                {CAMERAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400 space-y-1">
              Ambiance sonore
              <input
                value={ambiance}
                onChange={(e) => setAmbiance(e.target.value)}
                className={`w-full min-h-[36px] px-2 rounded-lg border text-sm bg-transparent outline-none ${
                  extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                }`}
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              Personnages cohérents
              <input
                value={characters}
                onChange={(e) => setCharacters(e.target.value)}
                placeholder="Ex: héro en veste rouge, robot bleu"
                className={`w-full min-h-[36px] px-2 rounded-lg border text-sm bg-transparent outline-none ${
                  extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                }`}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={transitions}
                onChange={(e) => setTransitions(e.target.checked)}
              />
              Transitions entre scènes
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={voiceover}
                onChange={(e) => setVoiceover(e.target.checked)}
              />
              Voix off / dialogues
            </label>
          </div>
        </section>

        {/* Storyboard */}
        <section className={`rounded-2xl border p-4 space-y-3 ${panelClass}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-medium text-cyan-100">
              Storyboard ({scenes.length} scènes)
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleStoryboard}
                disabled={storyboarding || !isOnline}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  extremeDark
                    ? "border border-cyan-500/25 text-cyan-300/85 hover:bg-cyan-950/40"
                    : "border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10"
                }`}
              >
                {storyboarding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Générer storyboard (Gemini)
              </button>
              <button
                type="button"
                onClick={addEmptyScene}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  extremeDark
                    ? "border border-white/[0.08] text-slate-300 hover:text-slate-100"
                    : "border border-white/[0.08] text-slate-300 hover:text-cyan-200"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Scène
              </button>
            </div>
          </div>

          {scenes.length === 0 ? (
            <p className="text-xs text-slate-500">
              Aucune scène. Génère un storyboard avec Gemini ou ajoute une scène manuellement.
            </p>
          ) : (
            <div className="space-y-3">
              {scenes.map((scene, idx) => (
                <div
                  key={scene.id}
                  className={`rounded-xl border p-3 space-y-2 ${
                    extremeDark ? "border-white/[0.08] bg-black/40" : "border-white/[0.08] bg-slate-950/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono-tabular text-cyan-300/80">
                      Scène {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeScene(scene.id)}
                      className="text-slate-500 hover:text-red-300 cursor-pointer"
                      aria-label="Supprimer la scène"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={scene.title}
                    onChange={(e) => updateScene(scene.id, { title: e.target.value })}
                    placeholder="Titre"
                    className={`w-full min-h-[32px] px-2 rounded-lg border text-sm bg-transparent outline-none ${
                      extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                    }`}
                  />
                  <textarea
                    value={scene.narration}
                    onChange={(e) => updateScene(scene.id, { narration: e.target.value })}
                    placeholder="Narration / voix off"
                    rows={2}
                    className={`w-full px-2 py-1.5 rounded-lg border text-xs bg-transparent outline-none resize-y ${
                      extremeDark ? "border-white/[0.1] text-slate-300" : "border-white/[0.1] text-slate-300"
                    }`}
                  />
                  <textarea
                    value={scene.imagePrompt}
                    onChange={(e) => updateScene(scene.id, { imagePrompt: e.target.value })}
                    placeholder="Prompt visuel (anglais)"
                    rows={2}
                    className={`w-full px-2 py-1.5 rounded-lg border text-xs bg-transparent outline-none resize-y ${
                      extremeDark ? "border-white/[0.1] text-slate-300" : "border-white/[0.1] text-slate-300"
                    }`}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={2}
                      max={15}
                      value={scene.durationSec}
                      onChange={(e) =>
                        updateScene(scene.id, { durationSec: Number(e.target.value) })
                      }
                      className={`w-20 min-h-[28px] px-2 rounded-lg border text-xs bg-transparent outline-none ${
                        extremeDark ? "border-white/[0.1] text-slate-300" : "border-white/[0.1] text-slate-300"
                      }`}
                    />
                    <span className="text-[11px] text-slate-500 self-center">secondes</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Providers */}
        <section className={`rounded-2xl border p-4 space-y-2 ${panelClass}`}>
          <h2 className="font-display text-base font-medium text-cyan-100">Fournisseur de génération</h2>
          {serverHistoryCount !== null && (
            <p className="text-[11px] text-slate-500">
              Historique serveur : {serverHistoryCount} génération(s). Les liens de téléchargement du serveur peuvent expirer au redémarrage : conservez vos exports locaux.
            </p>
          )}
          <p className="text-[11px] text-amber-300/80">
            Important : ce studio génère de véritables clips via le fournisseur sélectionné. Les réglages de ratio, style, caméra, transitions et voix ne sont pas appliqués par tous les fournisseurs : aucun habillage ni montage n&apos;est simulé. Selon le fournisseur, une clé et un quota dédiés sont requis (aucune activation payante sans votre accord).
          </p>
          {mode === "image" && selectedProvider && !selectedProvider.supportsImageToVideo && (
            <p className="text-[11px] text-rose-300/90">
              Le fournisseur actuel ne prend pas en charge l&apos;image → vidéo. La génération sera bloquée tant qu&apos;un fournisseur compatible ne sera pas sélectionné.
            </p>
          )}
          {providers.length === 0 ? (
            <p className="text-xs text-slate-500">Chargement…</p>
          ) : (
            <div className="space-y-2">
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className={`w-full min-h-[36px] px-2 rounded-lg border text-sm bg-transparent outline-none ${
                  extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                }`}
              >
                <option value="">Auto (premier configuré)</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.configured ? "✓" : "✗ (non configuré)"}
                  </option>
                ))}
              </select>
              {providers.map((p) => (
                <div key={p.id} className="text-[11px] text-slate-500 leading-relaxed">
                  <span className="text-slate-300 font-medium">{p.name}</span> — {p.notes}{" "}
                  {p.requires.length > 0 && (
                    <span className="text-amber-300/80">
                      (requiert : {p.requires.join(", ")})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Generate */}
        <section className={`rounded-2xl border p-4 space-y-3 ${panelClass}`}>
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
          {generating && (
            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">Génération en cours…</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !isOnline}
            className={`w-full min-h-[44px] rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
              extremeDark
                ? "bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-200 border border-cyan-500/35"
                : "bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-100 border border-cyan-400/35"
            }`}
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Générer la vidéo
          </button>

          {result?.videoUrl && (
            <div className="space-y-2">
              <video
                src={result.videoUrl}
                controls
                className="w-full rounded-xl border border-white/[0.08]"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">{result.notes}</span>
                <a
                  href={result.videoUrl}
                  download
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-medium border cursor-pointer ${
                    extremeDark
                      ? "border-cyan-500/25 text-cyan-300/85 hover:bg-cyan-950/40"
                      : "border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10"
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Télécharger
                </a>
              </div>
            </div>
          )}
        </section>

        {/* History */}
        <section className={`rounded-2xl border p-4 space-y-3 ${panelClass}`}>
          <h2 className="font-display text-base font-medium text-cyan-100">
            Historique ({history.length})
          </h2>
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">Aucune création pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{h.title}</p>
                    <p className="text-[10px] text-slate-500">
                      {h.provider} · {new Date(h.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {h.videoUrl && (
                      <a
                        href={h.videoUrl}
                        download
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
                        aria-label="Télécharger"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm("Supprimer cette génération de l'historique local ?")) return;
                        await removeVideoGeneration(h.id);
                        setHistory(await listVideoGenerations());
                      }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-300 cursor-pointer"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}