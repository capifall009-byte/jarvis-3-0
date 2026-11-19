import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clapperboard,
  Clock,
  Download,
  Film,
  Loader2,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import {
  cancelReelRender,
  getReelRenderJob,
  listReels,
  startReelRender,
  type ReelComposition,
  type ReelItem,
  type ReelRenderJob,
} from "../../services/video/ReelClient";
import { FPS, SCENES, TOTAL_FRAMES, WIDTH, HEIGHT } from "../../../remotion/reel/timeline";
import { STORY_FPS, STORY_SCENES } from "../../../remotion/story/timeline";
import { SERIAL_FPS, SERIAL_SCENES } from "../../../remotion/serial/timeline";
import { VideoGeneratorPanel } from "./VideoGeneratorPanel";

interface ReelStudioViewProps {
  extremeDark: boolean;
  isOnline: boolean;
}

const SCENE_LABELS: Record<string, string> = {
  hook: "Hook — l'accroche",
  valeur: "Le chiffre qui frappe",
  code: "Capacité 01 — Elle code",
  filme: "Capacité 02 — Elle filme",
  publie: "Capacité 03 — Elle publie",
  cta: "Call to action",
};

const STORY_SCENE_LABELS: Record<string, string> = {
  s1: "2089 — la Terre n'écoute plus",
  s2: "L'antenne de la station 07",
  s3: "Chaque nuit, trois secondes",
  s4: "Personne ne la croyait",
  s5: "Elle répondit",
  s6: "Le silence",
  s7: "Quatre secondes",
  s8: "L'aube — le début",
};

const SERIAL_SCENE_LABELS: Record<string, string> = {
  s1: "02:47 — le téléphone sonne",
  s2: "Ton propre numéro",
  s3: "Retour 3 secondes en arrière",
  s4: "NE RÉPONDS PAS",
  s5: "Un message daté de demain",
  s6: "Silence… puis ça recommence",
  s7: "Quelqu'un de l'autre côté de la porte",
  s8: "Vote — répondre ou laisser sonner",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} Mo`;
}

function formatDuration(frames: number, fps = FPS): string {
  return `${(frames / fps).toFixed(1)} s`;
}

export function ReelStudioView({ extremeDark, isOnline }: ReelStudioViewProps) {
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [compositions, setCompositions] = useState<ReelComposition[]>([]);
  const [selectedCompositionId, setSelectedCompositionId] = useState("InstagramReel");
  const [selected, setSelected] = useState<string | null>(null);
  const [job, setJob] = useState<ReelRenderJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const card = `rounded-2xl border p-4 ${
    extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"
  }`;
  const muted = extremeDark ? "text-slate-500" : "text-slate-400";

  const refresh = useCallback(async () => {
    try {
      const library = await listReels();
      setReels(library.reels);
      setCompositions(library.compositions);
      setJob(library.job);
      setSelected((prev) => {
        if (prev && library.reels.some((reel) => reel.name === prev)) return prev;
        return library.reels[0]?.name ?? null;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement des Reels impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (job?.status !== "running") return;
    const timer = setInterval(async () => {
      try {
        const next = await getReelRenderJob();
        setJob(next);
        if (next?.status === "done") {
          await refresh();
          if (next.fileName) setSelected(next.fileName);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Suivi du rendu impossible.");
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job?.status, refresh]);

  const reel = useMemo(
    () => reels.find((item) => item.name === selected) ?? reels[0] ?? null,
    [reels, selected]
  );

  // Garde la composition sélectionnée cohérente avec la vidéo affichée.
  useEffect(() => {
    if (!reel || compositions.length === 0) return;
    const match = compositions.find((item) => reel.name.startsWith(item.slug));
    if (match) setSelectedCompositionId(match.id);
  }, [reel?.name, compositions]);

  const running = job?.status === "running";
  const selectedComposition =
    compositions.find((item) => item.id === selectedCompositionId) ?? compositions[0];
  const isStory = selectedComposition?.id === "DernierSignal";
  const isSerial = selectedComposition?.id === "JourUn";
  const timeline = isStory
    ? STORY_SCENES.map((scene) => ({
        id: scene.id,
        from: scene.from,
        to: scene.to,
        duration: scene.duration,
        label: STORY_SCENE_LABELS[scene.id] ?? scene.id,
        fps: STORY_FPS,
        total: STORY_SCENES.length * scene.duration,
      }))
    : isSerial
      ? SERIAL_SCENES.map((scene) => ({
          id: scene.id,
          from: scene.from,
          to: scene.to,
          duration: scene.duration,
          label: SERIAL_SCENE_LABELS[scene.id] ?? scene.id,
          fps: SERIAL_FPS,
          total: SERIAL_SCENES.length * scene.duration,
        }))
      : SCENES.map((scene) => ({
        id: scene.id,
        from: scene.from,
        to: scene.to,
        duration: scene.duration,
        label: SCENE_LABELS[scene.id] ?? scene.id,
        fps: FPS,
        total: TOTAL_FRAMES,
      }));

  const handleRender = async () => {
    setError(null);
    try {
      const next = await startReelRender(selectedComposition?.id);
      setJob(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Démarrage du rendu impossible.");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelReelRender();
      const next = await getReelRenderJob();
      setJob(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annulation impossible.");
    }
  };

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1
            className={`font-display text-xl sm:text-2xl font-medium flex items-center gap-2 ${
              extremeDark ? "text-slate-200" : "text-cyan-50"
            }`}
          >
            <Clapperboard className="w-5 h-5 text-cyan-300" />
            Studio vidéo
          </h1>
          <p className={`text-sm ${muted}`}>
            Crée une vidéo avec JARVIS (script Gemini, voix off, rendu Remotion 9:16 / 16:9),
            puis choisis une composition à rendre ci-dessous.
          </p>
        </header>

        <VideoGeneratorPanel extremeDark={extremeDark} isOnline={isOnline} />

        <section className={`${card} space-y-3`}>
          <div>
            <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
              Composition à rendre
            </h2>
            <p className={`text-xs ${muted}`}>
              Choisis le film à générer, puis lance le rendu Remotion.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {compositions.length === 0 ? (
              <p className={`text-xs ${muted}`}>Chargement des compositions…</p>
            ) : (
              compositions.map((composition) => {
                const active = composition.id === selectedComposition?.id;
                return (
                  <button
                    key={composition.id}
                    type="button"
                    onClick={() => setSelectedCompositionId(composition.id)}
                    disabled={running}
                    className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                        : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <Film className="w-4 h-4" />
                    {composition.label}
                  </button>
                );
              })
            )}
          </div>
        </section>

        {error && (
          <div className={`rounded-xl border p-3 flex gap-2.5 text-xs ${extremeDark ? "border-rose-500/25 bg-rose-950/10 text-rose-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] items-start">
          {/* Lecteur */}
          <section className={`${card} space-y-4`}>
            <div className="mx-auto w-full max-w-[280px] rounded-[30px] border border-white/10 bg-black p-2 shadow-2xl">
              {reel ? (
                <video
                  key={reel.url}
                  src={reel.url}
                  controls
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full aspect-[9/16] rounded-[24px] bg-black object-cover"
                />
              ) : (
                <div className="w-full aspect-[9/16] rounded-[24px] bg-black flex flex-col items-center justify-center gap-2 text-center px-4">
                  <Film className="w-7 h-7 text-slate-600" />
                  <p className={`text-xs ${muted}`}>Aucun Reel rendu pour le moment.</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRender}
                disabled={running || !isOnline}
                className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  extremeDark
                    ? "border-cyan-400/30 text-cyan-100 hover:bg-cyan-400/10"
                    : "border-cyan-400/30 text-cyan-100 bg-cyan-500/10 hover:bg-cyan-500/15"
                }`}
              >
                {running ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {running ? "Rendu en cours…" : "Regénérer"}
              </button>

              {reel && (
                <a
                  href={reel.url}
                  download={reel.name}
                  className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border border-white/[0.1] text-sm text-slate-200 hover:bg-white/5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Télécharger
                </a>
              )}

              {running && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border border-rose-400/30 text-sm text-rose-200 hover:bg-rose-500/10 cursor-pointer"
                >
                  Annuler
                </button>
              )}
            </div>

            {running && (
              <div className="space-y-1.5">
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                    style={{ width: `${Math.max(3, job?.progress ?? 0)}%` }}
                  />
                </div>
                <p className={`text-xs ${muted}`}>
                  Rendu Remotion — {job?.progress ?? 0}% (1 à 8 min selon la composition)
                </p>
              </div>
            )}

            {job?.status === "error" && job.error && (
              <p className="text-xs text-rose-300 break-words">{job.error}</p>
            )}
          </section>

          {/* Détails */}
          <div className="space-y-6">
            <section className={`${card} space-y-3`}>
              <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
                Caractéristiques
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Format", value: `${selectedComposition?.width ?? WIDTH}×${selectedComposition?.height ?? HEIGHT}`, icon: Smartphone },
                  {
                    label: "Durée",
                    value: `${selectedComposition?.durationSec ?? TOTAL_FRAMES / FPS} s`,
                    icon: Clock,
                  },
                  { label: "Fréquence", value: `${selectedComposition?.fps ?? FPS} fps`, icon: Film },
                  { label: "Codec", value: "H.264 / AAC", icon: Clapperboard },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={`rounded-xl border p-3 ${extremeDark ? "border-white/[0.06]" : "border-cyan-400/10"}`}
                    >
                      <Icon className="w-3.5 h-3.5 text-cyan-300/80 mb-1.5" />
                      <p className={`text-[10px] uppercase tracking-wider ${muted}`}>{item.label}</p>
                      <p className="text-sm text-slate-100">{item.value}</p>
                    </div>
                  );
                })}
              </div>
              {reel && (
                <p className={`text-xs ${muted}`}>
                  {reel.name} · {formatBytes(reel.sizeBytes)} · rendu le{" "}
                  {new Date(reel.updatedAt).toLocaleString("fr-FR")}
                </p>
              )}
            </section>

            <section className={`${card} space-y-3`}>
              <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
                Découpage — {selectedComposition?.label ?? "Reel"}
              </h2>
              <ol className="space-y-2">
                {timeline.map((scene) => (
                  <li key={scene.id} className="flex items-center gap-3">
                    <span className={`font-mono text-[11px] tabular-nums w-20 shrink-0 ${muted}`}>
                      {formatDuration(scene.from, scene.fps)} → {formatDuration(scene.to, scene.fps)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-200 truncate">
                        {scene.label}
                      </span>
                      <span className="block h-1 mt-1 rounded-full bg-white/10 overflow-hidden">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-blue-500/80"
                          style={{ width: `${(scene.duration / scene.total) * 100}%` }}
                        />
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <section className={`${card} space-y-3`}>
              <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
                Rendus disponibles ({reels.length})
              </h2>
              {loading ? (
                <p className={`text-xs ${muted}`}>Chargement…</p>
              ) : reels.length === 0 ? (
                <p className={`text-xs ${muted}`}>Aucun fichier dans public/reels.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {reels.map((item) => {
                    const active = item.name === reel?.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => setSelected(item.name)}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs cursor-pointer ${
                          active
                            ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                            : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                        }`}
                      >
                        <Film className="w-3.5 h-3.5" />
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className={`text-[11px] leading-relaxed ${muted}`}>
                Pour modifier le contenu : <code>remotion/reel/scenes.tsx</code> (Reel) ou{" "}
                <code>remotion/story/scenes-*.tsx</code> et <code>timeline.ts</code> (Le Dernier Signal).
                Régénère la voix avec <code>npm run story:audio</code> si le texte change.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
