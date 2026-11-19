import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Download,
  Film,
  Loader2,
  RefreshCw,
  Smartphone,
  Sparkles,
} from "lucide-react";
import {
  cancelHyperframesRender,
  getHyperframesRenderJob,
  listHyperframes,
  startHyperframesRender,
  type HyperframesItem,
  type HyperframesProject,
  type HyperframesRenderJob,
} from "../../services/video/HyperframesClient";

interface HyperframesPanelProps {
  extremeDark: boolean;
  isOnline: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function HyperframesPanel({ extremeDark, isOnline }: HyperframesPanelProps) {
  const [renders, setRenders] = useState<HyperframesItem[]>([]);
  const [projects, setProjects] = useState<HyperframesProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [job, setJob] = useState<HyperframesRenderJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const card = `rounded-2xl border p-4 ${
    extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"
  }`;
  const muted = extremeDark ? "text-slate-500" : "text-slate-400";

  const refresh = useCallback(async () => {
    try {
      const library = await listHyperframes();
      setRenders(library.renders);
      setProjects(library.projects);
      setJob(library.job);
      setSelectedProjectId((prev) => {
        if (prev && library.projects.some((project) => project.id === prev)) return prev;
        return library.projects[0]?.id ?? "";
      });
      setSelected((prev) => {
        if (prev && library.renders.some((item) => item.name === prev)) return prev;
        return library.renders[0]?.name ?? null;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement Hyperframes impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = job?.status === "running";

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const next = await getHyperframesRenderJob();
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
  }, [running, refresh]);

  const render = useMemo(
    () => renders.find((item) => item.name === selected) ?? renders[0] ?? null,
    [renders, selected]
  );
  const project =
    projects.find((item) => item.id === selectedProjectId) ?? projects[0] ?? null;

  const handleRender = async () => {
    setError(null);
    try {
      const next = await startHyperframesRender(project?.id);
      setJob(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Démarrage du rendu impossible.");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelHyperframesRender();
      const next = await getHyperframesRenderJob();
      setJob(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annulation impossible.");
    }
  };

  return (
    <div className="space-y-6">
      <section className={`${card} space-y-3`}>
        <div>
          <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            Composition Hyperframes
          </h2>
          <p className={`text-xs ${muted}`}>
            Une composition HTML animée, rendue image par image puis encodée en MP4.
          </p>
        </div>
        {loading ? (
          <p className={`text-xs ${muted}`}>Chargement des projets…</p>
        ) : projects.length === 0 ? (
          <p className={`text-xs ${muted}`}>
            Aucun projet dans <code>hyperframes/</code>. Ajoute un dossier avec un{" "}
            <code>index.html</code> pour le voir apparaître ici.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {projects.map((item) => {
              const active = item.id === project?.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedProjectId(item.id)}
                  disabled={running}
                  className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100"
                      : "border-white/[0.08] text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{item.name}</span>
                  <span className={`text-[11px] ${muted}`}>{item.durationSec} s</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {error && (
        <div
          className={`rounded-xl border p-3 flex gap-2.5 text-xs ${
            extremeDark
              ? "border-rose-500/25 bg-rose-950/10 text-rose-100"
              : "border-rose-400/30 bg-rose-500/10 text-rose-100"
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] items-start">
        <section className={`${card} space-y-4`}>
          <div className="mx-auto w-full max-w-[280px] rounded-[30px] border border-white/10 bg-black p-2 shadow-2xl">
            {render ? (
              <video
                key={render.url}
                src={render.url}
                controls
                loop
                playsInline
                preload="metadata"
                className="w-full aspect-[9/16] rounded-[24px] bg-black object-cover"
              />
            ) : (
              <div className="w-full aspect-[9/16] rounded-[24px] bg-black flex flex-col items-center justify-center gap-2 text-center px-4">
                <Sparkles className="w-7 h-7 text-slate-600" />
                <p className={`text-xs ${muted}`}>Aucun rendu Hyperframes pour le moment.</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRender}
              disabled={running || !isOnline || !project}
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
              {running ? "Rendu en cours…" : "Rendre la composition"}
            </button>

            {render && (
              <a
                href={render.url}
                download={render.name}
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
                Rendu Hyperframes — {job?.progress ?? 0}% (Capture des images puis encodage)
              </p>
            </div>
          )}

          {job?.status === "error" && job.error && (
            <p className="text-xs text-rose-300 break-words">{job.error}</p>
          )}
        </section>

        <div className="space-y-6">
          <section className={`${card} space-y-3`}>
            <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
              Caractéristiques
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Format",
                  value: `${project?.width ?? 1080}×${project?.height ?? 1920}`,
                  icon: Smartphone,
                },
                {
                  label: "Durée",
                  value: `${project?.durationSec ?? "—"} s`,
                  icon: Clock,
                },
                { label: "Fréquence", value: `${project?.fps ?? 30} fps`, icon: Film },
                { label: "Moteur", value: "Hyperframes", icon: Sparkles },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={`rounded-xl border p-3 ${
                      extremeDark ? "border-white/[0.06]" : "border-cyan-400/10"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-cyan-300/80 mb-1.5" />
                    <p className={`text-[10px] uppercase tracking-wider ${muted}`}>{item.label}</p>
                    <p className="text-sm text-slate-100">{item.value}</p>
                  </div>
                );
              })}
            </div>
            {render && (
              <p className={`text-xs ${muted}`}>
                {render.name} · {formatBytes(render.sizeBytes)} · rendu le{" "}
                {new Date(render.updatedAt).toLocaleString("fr-FR")}
              </p>
            )}
          </section>

          <section className={`${card} space-y-3`}>
            <h2 className={`text-sm font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
              Rendus disponibles ({renders.length})
            </h2>
            {loading ? (
              <p className={`text-xs ${muted}`}>Chargement…</p>
            ) : renders.length === 0 ? (
              <p className={`text-xs ${muted}`}>Aucun fichier dans public/hyperframes.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {renders.map((item) => {
                  const active = item.name === render?.name;
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
              Sources : <code>hyperframes/&lt;projet&gt;/index.html</code>. Sorties :{" "}
              <code>public/hyperframes/</code>. Le navigateur (Edge ou Chrome installé) est
              détecté automatiquement sur Windows.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
