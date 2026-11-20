import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Film,
  ImageIcon,
  Info,
  Loader2,
  Monitor,
  Play,
  RefreshCw,
  Smartphone,
  Sparkles,
  Square,
  Video,
  X,
} from "lucide-react";
import type { AppView } from "../../types/jarvis.ts";
import {
  cancelRemotionJob,
  getRemotionJob,
  getRemotionStatus,
  isRemotionJobRunning,
  listRemotionJobs,
  startRemotionJob,
  type RemotionFormat,
  type RemotionJob,
  type RemotionStatus,
  type RemotionStyle,
} from "../../services/video/RemotionClient.ts";

interface RemotionStudioViewProps {
  isOnline: boolean;
  extremeDark: boolean;
  onNavigate: (view: AppView) => void;
}

const FORMAT_OPTIONS: Array<{
  id: RemotionFormat;
  label: string;
  size: string;
  icon: typeof Smartphone;
}> = [
  { id: "vertical", label: "TikTok / Reels", size: "1080 × 1920", icon: Smartphone },
  { id: "horizontal", label: "YouTube", size: "1920 × 1080", icon: Monitor },
  { id: "square", label: "Carré", size: "1080 × 1080", icon: Square },
];

const DURATIONS = [15, 30, 60, 90] as const;

const STYLE_OPTIONS: Array<{ id: RemotionStyle; label: string; hint: string }> = [
  { id: "documentaire", label: "Documentaire", hint: "Clair, posé, pédagogique" },
  { id: "dynamique", label: "Dynamique", hint: "Rythmé, accroche immédiate" },
  { id: "inspirant", label: "Inspirant", hint: "Émotion et conclusion motivante" },
  { id: "minimal", label: "Minimal", hint: "Épuré, centré sur le texte" },
];

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function aspectRatio(format: RemotionFormat): string {
  if (format === "vertical") return "9 / 16";
  if (format === "square") return "1 / 1";
  return "16 / 9";
}

export function RemotionStudioView({
  isOnline,
  extremeDark,
  onNavigate,
}: RemotionStudioViewProps) {
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<RemotionFormat>("vertical");
  const [durationSec, setDurationSec] = useState<number>(30);
  const [style, setStyle] = useState<RemotionStyle>("documentaire");
  const [status, setStatus] = useState<RemotionStatus | null>(null);
  const [job, setJob] = useState<RemotionJob | null>(null);
  const [jobs, setJobs] = useState<RemotionJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [hyperPanel, setHyperPanel] = useState(false);
  const pollRef = useRef<number | null>(null);

  const card = `rounded-2xl border p-4 ${
    extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"
  }`;
  const muted = extremeDark ? "text-slate-500" : "text-slate-400";

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextJobs] = await Promise.all([
        getRemotionStatus(),
        listRemotionJobs(),
      ]);
      setStatus(nextStatus);
      setJobs(nextJobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement du studio impossible.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = isRemotionJobRunning(job);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!job || !isRemotionJobRunning(job)) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const next = await getRemotionJob(job.id);
        setJob(next);
        if (!isRemotionJobRunning(next)) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          void refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Suivi du rendu indisponible.");
      }
    }, 1200);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [job?.id, job?.status, refresh]);

  const selectedFormat = useMemo(
    () => FORMAT_OPTIONS.find((option) => option.id === format) ?? FORMAT_OPTIONS[0],
    [format]
  );

  const handleStart = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isOnline) {
      setError("Une connexion est nécessaire : Gemini rédige le script de la vidéo.");
      return;
    }
    if (prompt.trim().length < 8) {
      setError("Décris ta vidéo en au moins 8 caractères.");
      return;
    }
    setStarting(true);
    try {
      const created = await startRemotionJob({
        prompt: prompt.trim(),
        format,
        durationSec,
        style,
      });
      setJob(created);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lancement du rendu impossible.");
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    setError(null);
    try {
      await cancelRemotionJob(job.id);
      setJob(await getRemotionJob(job.id));
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annulation impossible.");
    }
  };

  const mp4 = job?.result?.files?.[0] ?? null;

  return (
    <div className="space-y-5 pb-10">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1
            className={`text-2xl font-semibold flex items-center gap-2 ${
              extremeDark ? "text-slate-100" : "text-cyan-50"
            }`}
          >
            <Film className="w-6 h-6 text-cyan-300" />
            Studio Remotion
          </h1>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-200">
            Moteur réel · rendu MP4
          </span>
        </div>
        <p className={`mt-1 text-sm ${muted}`}>
          Un prompt, un format, un style : Gemini écrit le script, Remotion produit la
          composition et l'image, puis exporte le MP4.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Remplacement de l'ancienne option « Créer une vidéo IA ». */}
      <section className={`${card} space-y-3`}>
        <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
          Créer une vidéo
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setHyperPanel(false);
              document.getElementById("remotion-form")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group flex items-start gap-3 rounded-xl border border-cyan-400/35 bg-cyan-500/10 p-4 text-left transition hover:bg-cyan-500/15"
          >
            <Film className="w-5 h-5 text-cyan-300 mt-0.5 shrink-0" />
            <span>
              <span className="block text-sm font-medium text-cyan-100">
                Créer avec Remotion
              </span>
              <span className={`block text-xs mt-0.5 ${muted}`}>
                Compositions React, aperçu réel, export MP4. Disponible maintenant.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHyperPanel((value) => !value)}
            className="group flex items-start gap-3 rounded-xl border border-white/[0.09] bg-white/[0.02] p-4 text-left transition hover:bg-white/[0.05]"
          >
            <Sparkles className="w-5 h-5 text-violet-300 mt-0.5 shrink-0" />
            <span className="flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="block text-sm font-medium text-slate-200">
                  Créer avec HyperFrames
                </span>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                  non validé
                </span>
              </span>
              <span className={`block text-xs mt-0.5 ${muted}`}>
                Intégration préparée séparément, sans rendu testé. Aucune fonctionnalité
                n'est annoncée comme opérationnelle.
              </span>
            </span>
          </button>
        </div>

        {hyperPanel && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-4 text-sm space-y-2">
            <div className="flex items-start gap-2 text-amber-200">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">État honnête de l'intégration HyperFrames</p>
                <p className={`text-xs mt-1 ${muted}`}>
                  {status?.hyperframes
                    ? `CLI détectée : ${status.hyperframes.installed ? "oui" : "non"} · documentation locale : ${
                        status.hyperframes.documented ? "oui" : "non"
                      } · rendu réel validé : ${status.hyperframes.validated ? "oui" : "non"}.`
                    : "Statut en cours de lecture…"}
                </p>
                <p className={`text-xs mt-1 ${muted}`}>
                  Aucun appel HyperFrames n'est lancé depuis ce studio. Le panneau
                  historique reste accessible dans « Reels » sans modification de contrat.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("reels")}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"
            >
              Ouvrir le panneau HyperFrames historique
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      <form id="remotion-form" onSubmit={(event) => void handleStart(event)} className={`${card} space-y-4`}>
        <div>
          <label
            htmlFor="remotion-prompt"
            className={`block text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}
          >
            Prompt de la vidéo
          </label>
          <textarea
            id="remotion-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            maxLength={1200}
            placeholder="Ex. Explique en 30 secondes comment fonctionne un tunnel Cloudflare, avec une accroche forte et une conclusion concrète."
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
          />
          <p className={`text-[11px] mt-1 ${muted}`}>
            Gemini interprète ce prompt et rédige le storyboard (scripts local honnête en secours).
          </p>
        </div>

        <div className="space-y-2">
          <p className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            Format
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {FORMAT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = option.id === format;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFormat(option.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>
                    <span className="block text-xs font-medium">{option.label}</span>
                    <span className={`block text-[10px] ${muted}`}>{option.size}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
              Durée cible
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDurationSec(value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    durationSec === value
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {value} s
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
              Style visuel
            </p>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  title={option.hint}
                  onClick={() => setStyle(option.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    style === option.id
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={starting || running}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting || running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {running ? "Rendu en cours…" : "Rendre la vidéo"}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Actualiser
          </button>
          <span className={`text-xs ${muted}`}>
            {status?.remotion?.installed
              ? `Remotion ${status.remotion.version ?? ""} · ${selectedFormat.size}`
              : "Remotion non détecté localement."}
          </span>
        </div>
      </form>

      {job && (
        <section className={`${card} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
              Rendu en cours / récent
            </h2>
            <span className={`text-xs ${muted}`}>
              <Clock className="inline w-3.5 h-3.5 mr-1" />
              {new Date(job.createdAt).toLocaleString("fr-FR")}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-0.5 border ${
                job.status === "done"
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                  : job.status === "error"
                    ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                    : "border-cyan-400/30 bg-cyan-500/10 text-cyan-200"
              }`}
            >
              {job.status}
            </span>
            <span className={muted}>{job.step}</span>
            {job.title && <span className={muted}>· {job.title}</span>}
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
            />
          </div>
          <div className={`flex items-center justify-between text-[11px] ${muted}`}>
            <span>Progression réelle (sortie du processus Remotion)</span>
            <span>{job.progress}%</span>
          </div>

          {job.warning && (
            <p className="rounded-lg border border-amber-400/25 bg-amber-500/[0.06] p-2.5 text-xs text-amber-200/90">
              {job.warning}
            </p>
          )}
          {job.error && (
            <p className="rounded-lg border border-rose-400/25 bg-rose-500/[0.06] p-2.5 text-xs text-rose-200/90">
              {job.error}
            </p>
          )}

          {running && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10"
            >
              <X className="w-3.5 h-3.5" />
              Annuler le rendu
            </button>
          )}
        </section>
      )}

      {job?.preview && (
        <section className={`${card} space-y-3`}>
          <h2 className={`flex items-center gap-2 text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            <ImageIcon className="w-4 h-4 text-cyan-300" />
            Aperçu — image réelle générée par Remotion
          </h2>
          <div className="mx-auto flex max-h-[420px] items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 p-2">
            <img
              src={job.preview.url}
              alt="Aperçu de la composition Remotion"
              className="max-h-[400px] w-auto rounded-lg object-contain"
              style={{ aspectRatio: aspectRatio(job.format) }}
            />
          </div>
        </section>
      )}

      {mp4 && (
        <section className={`${card} space-y-3`}>
          <h2 className={`flex items-center gap-2 text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            <Video className="w-4 h-4 text-cyan-300" />
            Vidéo terminée
          </h2>
          <video
            controls
            preload="metadata"
            src={mp4.url}
            className="mx-auto max-h-[460px] w-full rounded-xl border border-white/[0.08] bg-black"
            style={{ aspectRatio: aspectRatio(job!.format) }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={mp4.url}
              download={mp4.fileName}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/20"
            >
              <Download className="w-4 h-4" />
              Télécharger le MP4
            </a>
            <span className={`text-xs ${muted}`}>
              {mp4.width} × {mp4.height} · {formatBytes(mp4.sizeBytes)} · {mp4.fileName}
            </span>
          </div>
        </section>
      )}

      {jobs.length > 0 && (
        <section className={`${card} space-y-3`}>
          <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            Historique des rendus Remotion
          </h2>
          <div className="space-y-2">
            {jobs.slice(0, 8).map((item) => {
              const active = job?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setJob(item)}
                  className={`flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                    active ? "border-cyan-400/35 bg-cyan-500/10" : "border-white/[0.07] hover:bg-white/5"
                  }`}
                >
                  {item.status === "done" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                  ) : item.status === "error" ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-cyan-300" />
                  )}
                  <span className="truncate max-w-[280px] text-slate-200">
                    {item.title || item.prompt}
                  </span>
                  <span className={muted}>
                    {item.format} · {item.durationSec} s · {item.progress}%
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <p className={`text-[11px] leading-relaxed ${muted}`}>
        Aucun rendu ni aucune capacité n'est simulée : l'aperçu est un fichier PNG produit
        par Remotion, la barre de progression suit la sortie réelle du processus, et le
        MP4 est téléchargé depuis le serveur. HyperFrames reste une intégration séparée,
        non validée. Les studios vidéo et Reels historiques restent accessibles
        respectivement via « Studio vidéo » et « Reels ».
      </p>

      <button
        type="button"
        onClick={() => onNavigate("aiVideo")}
        className="inline-flex items-center gap-2 text-xs text-slate-400 underline underline-offset-2 hover:text-cyan-200"
      >
        Ouvrir l'ancien Studio vidéo IA (fonctionnalité historique conservée)
      </button>
    </div>
  );
}
