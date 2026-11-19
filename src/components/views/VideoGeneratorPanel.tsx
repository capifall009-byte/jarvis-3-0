import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Lightbulb,
  Link2,
  Loader2,
  Monitor,
  Smartphone,
  Sparkles,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  cancelVideoJob,
  deleteVideoJob,
  getVideoJob,
  isJobRunning,
  listVideoJobs,
  startVideoGeneration,
  type VideoStudioFormat,
  type VideoStudioJob,
  type VideoStudioSourceKind,
  type VideoStudioTone,
} from "../../services/video/VideoStudioClient";

interface VideoGeneratorPanelProps {
  extremeDark: boolean;
  isOnline: boolean;
}

const DURATIONS = [60, 75, 90] as const;

const SOURCES: Array<{
  id: VideoStudioSourceKind;
  label: string;
  icon: typeof Type;
  placeholder: string;
}> = [
  {
    id: "topic",
    label: "Sujet libre",
    icon: Lightbulb,
    placeholder: "Ex. Les tunnels Cloudflare expliqués simplement",
  },
  {
    id: "text",
    label: "Texte collé",
    icon: Type,
    placeholder: "Colle ici le texte, le script ou les notes à transformer en vidéo…",
  },
  {
    id: "url",
    label: "Lien / article",
    icon: Link2,
    placeholder: "https://exemple.com/article-a-resumer",
  },
];

const TONES: Array<{ id: VideoStudioTone; label: string }> = [
  { id: "pedagogique", label: "Pédagogique" },
  { id: "energique", label: "Énergique" },
  { id: "inspirant", label: "Inspirant" },
];

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(job: VideoStudioJob): string {
  if (job.status === "done") return "Terminée";
  if (job.status === "error") return "Échec";
  if (job.status === "canceled") return "Annulée";
  return job.step;
}

function jobTitle(job: VideoStudioJob): string {
  return job.title || `Vidéo ${job.id.replace("video-", "")}`;
}

export function VideoGeneratorPanel({ extremeDark, isOnline }: VideoGeneratorPanelProps) {
  const [sourceKind, setSourceKind] = useState<VideoStudioSourceKind>("topic");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [formats, setFormats] = useState<"vertical" | "horizontal" | "both">("vertical");
  const [durationSec, setDurationSec] = useState<number>(75);
  const [tone, setTone] = useState<VideoStudioTone>("pedagogique");

  const [jobs, setJobs] = useState<VideoStudioJob[]>([]);
  const [activeJob, setActiveJob] = useState<VideoStudioJob | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const card = `rounded-2xl border p-4 ${
    extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"
  }`;
  const muted = extremeDark ? "text-slate-500" : "text-slate-400";
  const running = isJobRunning(activeJob);

  const refresh = useCallback(async () => {
    try {
      const next = await listVideoJobs();
      setJobs(next);
      const current = next.find((job) => isJobRunning(job)) ?? null;
      setActiveJob(current);
      setSelectedId((prev) => prev ?? next[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement des vidéos impossible.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeJob || !isJobRunning(activeJob)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await getVideoJob(activeJob.id);
        setActiveJob(isJobRunning(next) ? next : null);
        setJobs((prev) => {
          const others = prev.filter((job) => job.id !== next.id);
          return [next, ...others].sort((a, b) => b.createdAt - a.createdAt);
        });
        setSelectedId(next.id);
        if (!isJobRunning(next)) await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Suivi de la génération impossible.");
      }
    }, 1500);
    pollRef.current = timer;
    return () => {
      window.clearInterval(timer);
      pollRef.current = null;
    };
  }, [activeJob, refresh]);

  const selected = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? jobs[0] ?? null,
    [jobs, selectedId]
  );

  const sourceValue =
    sourceKind === "topic" ? topic : sourceKind === "text" ? text : url;

  const canSubmit =
    isOnline &&
    !running &&
    !starting &&
    sourceValue.trim().length >= (sourceKind === "topic" ? 3 : sourceKind === "url" ? 8 : 40);

  const handleGenerate = async () => {
    setError(null);
    setStarting(true);
    try {
      const job = await startVideoGeneration({
        sourceKind,
        topic: sourceKind === "topic" ? topic : undefined,
        text: sourceKind === "text" ? text : undefined,
        url: sourceKind === "url" ? url : undefined,
        formats,
        durationSec,
        tone,
      });
      setActiveJob(job);
      setJobs((prev) => [job, ...prev.filter((item) => item.id !== job.id)]);
      setSelectedId(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Génération impossible.");
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeJob) return;
    try {
      await cancelVideoJob(activeJob.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annulation impossible.");
    }
  };

  const handleDelete = async (job: VideoStudioJob) => {
    const confirmed = window.confirm(
      `Supprimer définitivement « ${jobTitle(job)} » et ses fichiers ?`
    );
    if (!confirmed) return;
    try {
      await deleteVideoJob(job.id);
      setJobs((prev) => prev.filter((item) => item.id !== job.id));
      if (selectedId === job.id) setSelectedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    }
  };

  const fileFor = (job: VideoStudioJob | null, format: VideoStudioFormat) =>
    job?.result?.files.find((file) => file.format === format) ?? null;

  const selectedVertical = fileFor(selected, "vertical");
  const selectedHorizontal = fileFor(selected, "horizontal");

  return (
    <div className="space-y-6">
      <section className={`${card} space-y-5`}>
        <header className="space-y-1">
          <h2
            className={`text-sm font-medium flex items-center gap-2 ${
              extremeDark ? "text-slate-200" : "text-cyan-50"
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-300" />
            Créer une vidéo avec JARVIS
          </h2>
          <p className={`text-xs ${muted}`}>
            Un sujet, un texte ou un lien → script Gemini, voix off HenriNeural et rendu
            Remotion 9:16 / 16:9.
          </p>
        </header>

        {error && (
          <div className={`rounded-xl border p-3 flex gap-2.5 text-xs ${extremeDark ? "border-rose-500/25 bg-rose-950/10 text-rose-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Fermer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {SOURCES.map((source) => {
            const Icon = source.icon;
            const active = sourceKind === source.id;
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => setSourceKind(source.id)}
                className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border text-xs cursor-pointer ${
                  active
                    ? "border-cyan-400/45 bg-cyan-500/10 text-cyan-100"
                    : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {source.label}
              </button>
            );
          })}
        </div>

        <textarea
          value={sourceValue}
          onChange={(event) => {
            if (sourceKind === "topic") setTopic(event.target.value);
            else if (sourceKind === "text") setText(event.target.value);
            else setUrl(event.target.value);
          }}
          rows={sourceKind === "text" ? 7 : 3}
          maxLength={sourceKind === "text" ? 8000 : sourceKind === "url" ? 2000 : 500}
          placeholder={SOURCES.find((source) => source.id === sourceKind)?.placeholder}
          className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-transparent outline-none focus:border-cyan-400/60 ${
            extremeDark ? "border-white/[0.08] text-slate-100" : "border-cyan-400/20 text-slate-100"
          }`}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className={`text-[10px] uppercase tracking-wider ${muted}`}>Format</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "vertical" as const, label: "9:16", icon: Smartphone },
                { id: "horizontal" as const, label: "16:9", icon: Monitor },
                { id: "both" as const, label: "Les deux", icon: Film },
              ].map((option) => {
                const Icon = option.icon;
                const active = formats === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFormats(option.id)}
                    className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border text-[11px] cursor-pointer ${
                      active
                        ? "border-cyan-400/45 bg-cyan-500/10 text-cyan-100"
                        : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className={`text-[10px] uppercase tracking-wider ${muted}`}>Durée</p>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  onClick={() => setDurationSec(duration)}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg border text-[11px] cursor-pointer ${
                    durationSec === duration
                      ? "border-cyan-400/45 bg-cyan-500/10 text-cyan-100"
                      : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  {duration} s
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className={`text-[10px] uppercase tracking-wider ${muted}`}>Ton</p>
            <div className="flex flex-wrap gap-1.5">
              {TONES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTone(option.id)}
                  className={`min-h-[36px] px-2.5 rounded-lg border text-[11px] cursor-pointer ${
                    tone === option.id
                      ? "border-cyan-400/45 bg-cyan-500/10 text-cyan-100"
                      : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-cyan-400/35 bg-cyan-500/15 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {starting || running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {running ? "Génération en cours…" : "Générer la vidéo"}
          </button>

          {running && (
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-rose-400/30 text-sm text-rose-200 hover:bg-rose-500/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
              Annuler
            </button>
          )}

          <p className={`text-[11px] ${muted}`}>
            {durationSec} s de voix off · 6 à 10 scènes · rendu local (1 à 4 min)
          </p>
        </div>

        {running && activeJob && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                style={{ width: `${Math.max(3, activeJob.progress)}%` }}
              />
            </div>
            <p className={`text-xs ${muted}`}>
              {activeJob.step} — {activeJob.progress}%
            </p>
          </div>
        )}

        {activeJob?.warning && running && (
          <p className="text-[11px] text-amber-200/80">{activeJob.warning}</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr] items-start">
        <section className={`${card} space-y-3`}>
          <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            Mes vidéos ({jobs.length})
          </h2>
          {jobs.length === 0 ? (
            <p className={`text-xs ${muted}`}>Aucune vidéo générée pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const active = job.id === selected?.id;
                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedId(job.id)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer ${
                      active
                        ? "border-cyan-400/40 bg-cyan-500/10"
                        : "border-white/[0.08] hover:bg-white/5"
                    }`}
                  >
                    <p className="text-xs text-slate-100 truncate">{jobTitle(job)}</p>
                    <p className={`text-[10px] mt-0.5 ${muted}`}>
                      {formatDate(job.createdAt)} · {statusLabel(job)}
                      {job.result ? ` · ${job.result.durationSec} s` : ""}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className={`${card} space-y-4`}>
          {!selected ? (
            <div className="aspect-video max-h-[320px] w-full rounded-xl border border-white/[0.06] flex flex-col items-center justify-center gap-2 text-center px-4">
              <Film className="w-7 h-7 text-slate-600" />
              <p className={`text-xs ${muted}`}>
                La vidéo générée apparaîtra ici avec lecteur et téléchargement.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm text-slate-100 truncate">{jobTitle(selected)}</h3>
                  <p className={`text-[11px] ${muted}`}>
                    {statusLabel(selected)}
                    {selected.result
                      ? ` · ${selected.result.sceneCount} scènes · ${formatBytes(
                          selected.result.files.reduce((sum, file) => sum + file.sizeBytes, 0)
                        )}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-lg border border-rose-400/25 text-[11px] text-rose-200 hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer
                </button>
              </div>

              {selected.error && (
                <p className="text-xs text-rose-300 break-words">{selected.error}</p>
              )}
              {selected.warning && !selected.error && (
                <p className="text-[11px] text-amber-200/85">{selected.warning}</p>
              )}

              {selectedVertical && (
                <div className="flex flex-wrap items-start gap-4">
                  <div className="w-full max-w-[240px] rounded-[26px] border border-white/10 bg-black p-1.5 shadow-2xl">
                    <video
                      key={selectedVertical.url}
                      src={selectedVertical.url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full aspect-[9/16] rounded-[20px] bg-black object-cover"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-200">Version 9:16</p>
                    <p className={`text-[11px] ${muted}`}>{formatBytes(selectedVertical.sizeBytes)}</p>
                    <a
                      href={selectedVertical.url}
                      download={selectedVertical.fileName}
                      className="inline-flex items-center gap-2 min-h-[38px] px-3 rounded-xl border border-white/[0.1] text-xs text-slate-200 hover:bg-white/5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Télécharger
                    </a>
                  </div>
                </div>
              )}

              {selectedHorizontal && (
                <div className="space-y-2">
                  <div className="rounded-xl border border-white/10 bg-black overflow-hidden">
                    <video
                      key={selectedHorizontal.url}
                      src={selectedHorizontal.url}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full aspect-video bg-black"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-slate-200">Version 16:9</p>
                    <p className={`text-[11px] ${muted}`}>{formatBytes(selectedHorizontal.sizeBytes)}</p>
                    <a
                      href={selectedHorizontal.url}
                      download={selectedHorizontal.fileName}
                      className="inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-lg border border-white/[0.1] text-[11px] text-slate-200 hover:bg-white/5"
                    >
                      <Download className="w-3 h-3" />
                      Télécharger
                    </a>
                  </div>
                </div>
              )}

              {selected.status === "done" && !selectedVertical && !selectedHorizontal && (
                <p className={`text-xs ${muted}`}>
                  Aucun fichier vidéo retrouvé pour cette génération.
                </p>
              )}

              {isJobRunning(selected) && (
                <p className={`text-xs ${muted} flex items-center gap-2`}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {selected.step} — {selected.progress}%
                </p>
              )}

              {selected.status === "done" && (
                <p className="text-[11px] text-emerald-300/90 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Vidéo rendue par Remotion, voix off HenriNeural.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
