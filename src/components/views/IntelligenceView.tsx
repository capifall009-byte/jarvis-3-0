import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Target,
  Trash2,
  Upload,
  UserCog,
  X,
} from "lucide-react";
import type {
  ConversationSession,
  IntelligenceHistoryEvent,
  IntelligenceProfile,
  MemoryCategory,
  MemoryItem,
  ProjectItem,
  ProjectStatus,
  ProjectTask,
  ProjectTaskStatus,
} from "../../types/jarvis";
import { MemoryView } from "./MemoryView";
import {
  addBlocker,
  addTask,
  exportProjectsJson,
  importProjectsJson,
  linkConversation,
  removeTask,
  resolveBlocker,
  setTaskStatus,
} from "../../services/projects/ProjectRepository";

type TabId = "profil" | "memoire" | "projets" | "historique";

interface IntelligenceViewProps {
  initialTab?: TabId;
  extremeDark: boolean;
  profile: IntelligenceProfile;
  onUpdateProfile: (patch: Partial<IntelligenceProfile>) => void;
  memories: MemoryItem[];
  memoryEnabled: boolean;
  onAddMemory: (fact: string, category: MemoryCategory) => void;
  onUpdateMemory: (id: string, fact: string, category: MemoryCategory) => void;
  onTogglePinMemory: (id: string) => void;
  onToggleDisableMemory: (id: string) => void;
  onRemoveMemory: (id: string) => void;
  onSetMemoryEnabled: (enabled: boolean) => void;
  onReloadMemories: () => void;
  projects: ProjectItem[];
  projectsLoading?: boolean;
  projectsError?: string | null;
  onReloadProjects: () => Promise<void>;
  onCreateProject: (name: string, objective?: string) => Promise<ProjectItem>;
  onSaveProject: (project: ProjectItem) => Promise<ProjectItem>;
  onRemoveProject: (id: string) => Promise<void>;
  history: IntelligenceHistoryEvent[];
  historyLoading?: boolean;
  historyError?: string | null;
  onReloadHistory?: () => Promise<void>;
  onAddHistory: (event: Omit<IntelligenceHistoryEvent, "id" | "createdAt">) => Promise<void>;
  onClearHistory: () => Promise<void>;
  sessions: ConversationSession[];
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Actif",
  paused: "En pause",
  completed: "Terminé",
  archived: "Archivé",
};

const TASK_STATUS_LABELS: Record<ProjectTaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloqué",
  done: "Terminé",
};

function formatDateTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString("fr-FR");
  }
}

function ProgressBar({ value, extremeDark }: { value: number; extremeDark: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`h-2 rounded-full overflow-hidden ${extremeDark ? "bg-white/[0.06]" : "bg-white/[0.08]"}`}>
      <div className="h-full rounded-full bg-cyan-400/80" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TaskRow({
  project,
  task,
  depth,
  extremeDark,
  onChangeStatus,
  onAddSubtask,
  onDelete,
}: {
  project: ProjectItem;
  task: ProjectTask;
  depth: number;
  extremeDark: boolean;
  onChangeStatus: (taskId: string, status: ProjectTaskStatus) => void;
  onAddSubtask: (parentTaskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = task.subtasks.length > 0;
  return (
    <div className="space-y-1.5">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
          extremeDark ? "border-white/[0.06] bg-white/[0.02]" : "border-white/[0.08] bg-white/[0.03]"
        }`}
        style={{ marginLeft: depth * 14 }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-slate-400 hover:text-cyan-200 cursor-pointer" aria-label={open ? "Replier" : "Déplier"}>
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className={`flex-1 min-w-[140px] text-sm ${task.status === "done" ? "text-slate-500 line-through" : "text-slate-200"}`}>
          {task.title}
        </span>
        <select
          value={task.status}
          onChange={(e) => onChangeStatus(task.id, e.target.value as ProjectTaskStatus)}
          className={`h-8 px-2 rounded-lg border text-xs ${extremeDark ? "bg-black border-white/[0.08] text-slate-200" : "bg-[#050A14] border-cyan-400/20 text-slate-200"}`}
          aria-label="Statut de la tâche"
        >
          {(Object.keys(TASK_STATUS_LABELS) as ProjectTaskStatus[]).map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button type="button" onClick={() => onAddSubtask(task.id)} className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-white/[0.08] text-xs text-slate-300 hover:text-cyan-200 cursor-pointer">
          <Plus className="w-3.5 h-3.5" />Sous-tâche
        </button>
        <button type="button" onClick={() => onDelete(task.id)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 cursor-pointer" aria-label="Supprimer la tâche">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {hasChildren && open && (
        <div className="space-y-1.5">
          {task.subtasks.map((st) => (
            <TaskRow
              key={st.id}
              project={project}
              task={st}
              depth={depth + 1}
              extremeDark={extremeDark}
              onChangeStatus={onChangeStatus}
              onAddSubtask={onAddSubtask}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function IntelligenceView(props: IntelligenceViewProps) {
  const {
    initialTab,
    extremeDark,
    profile,
    onUpdateProfile,
    memories,
    memoryEnabled,
    onAddMemory,
    onUpdateMemory,
    onTogglePinMemory,
    onToggleDisableMemory,
    onRemoveMemory,
    onSetMemoryEnabled,
    onReloadMemories,
    projects,
    projectsLoading = false,
    projectsError = null,
    onReloadProjects,
    onCreateProject,
    onSaveProject,
    onRemoveProject,
    history,
    historyLoading = false,
    historyError = null,
    onReloadHistory,
    onAddHistory,
    onClearHistory,
    sessions,
  } = props;

  const [tab, setTab] = useState<TabId>(initialTab ?? "profil");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectObjective, setNewProjectObjective] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [subtaskTarget, setSubtaskTarget] = useState<string | null>(null);
  const [blockerDraft, setBlockerDraft] = useState("");
  const [nextActionDraft, setNextActionDraft] = useState("");
  const [projectMsg, setProjectMsg] = useState<string | null>(null);
  const [projectMsgKind, setProjectMsgKind] = useState<"success" | "error">("success");
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectOpError, setProjectOpError] = useState<string | null>(null);
  const [retryProjectAction, setRetryProjectAction] = useState<(() => Promise<void>) | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyOpError, setHistoryOpError] = useState<string | null>(null);
  const [retryHistoryAction, setRetryHistoryAction] = useState<(() => Promise<void>) | null>(null);
  const [linkSessionId, setLinkSessionId] = useState("");

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const effectiveSelectedId = selectedProject?.id || null;

  const card = `rounded-2xl border p-4 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"}`;
  const inputCls = `h-11 px-3.5 rounded-xl border text-sm focus:outline-none ${
    extremeDark
      ? "bg-black border-white/[0.07] focus:border-cyan-500/40 text-slate-200 placeholder:text-slate-600"
      : "bg-[#050A14]/85 border-cyan-400/20 focus:border-cyan-400/50 text-slate-100 placeholder:text-slate-500"
  }`;
  const btn = "inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const btnPrimary = `${btn} border-cyan-400/35 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25`;
  const btnGhost = `${btn} border-white/[0.08] text-slate-200 hover:bg-white/[0.05]`;
  const btnDanger = `${btn} border-red-400/25 text-red-200 hover:bg-red-500/10`;

  const setProjectFeedback = (msg: string | null, kind: "success" | "error" = "success") => {
    setProjectMsg(msg);
    setProjectMsgKind(kind);
    if (msg) {
      window.setTimeout(() => {
        setProjectMsg((curr) => (curr === msg ? null : curr));
      }, 4500);
    }
  };

  const runProjectAction = async (action: () => Promise<void>, retry?: () => Promise<void>) => {
    setProjectBusy(true);
    setProjectOpError(null);
    setRetryProjectAction(null);
    try {
      await action();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur lors de l'opération projet.";
      setProjectOpError(msg);
      if (retry) setRetryProjectAction(() => retry);
      setProjectFeedback(msg, "error");
    } finally {
      setProjectBusy(false);
    }
  };

  const updateSelectedProject = async (updater: (p: ProjectItem) => ProjectItem) => {
    if (!selectedProject) return;
    const next = updater(selectedProject);
    const run = async () => {
      await onSaveProject(next);
    };
    await runProjectAction(run, run);
  };

  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    const objective = newProjectObjective.trim() || undefined;
    if (!name) return;
    const run = async () => {
      const p = await onCreateProject(name, objective);
      setSelectedProjectId(p.id);
      setNewProjectName("");
      setNewProjectObjective("");
      setProjectFeedback("Projet créé.");
    };
    await runProjectAction(run, run);
  };

  const handleAddTask = async () => {
    if (!selectedProject || !taskDraft.trim()) return;
    const title = taskDraft.trim();
    const parent = subtaskTarget || undefined;
    const run = async () => {
      await updateSelectedProject((p) => addTask(p, title, parent));
      setTaskDraft("");
      setSubtaskTarget(null);
      setProjectFeedback(parent ? "Sous-tâche ajoutée." : "Tâche ajoutée.");
    };
    // updateSelectedProject already wraps; call directly to keep retry logic coherent
    setProjectBusy(true);
    setProjectOpError(null);
    setRetryProjectAction(null);
    try {
      const next = addTask(selectedProject, title, parent);
      await onSaveProject(next);
      setTaskDraft("");
      setSubtaskTarget(null);
      setProjectFeedback(parent ? "Sous-tâche ajoutée." : "Tâche ajoutée.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec de l'ajout de la tâche.";
      setProjectOpError(msg);
      setRetryProjectAction(() => run);
      setProjectFeedback(msg, "error");
    } finally {
      setProjectBusy(false);
    }
  };

  const handleExportProjects = () => {
    try {
      const json = exportProjectsJson(projects);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jarvis-projets-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setProjectFeedback("Export projets généré.");
    } catch (e) {
      setProjectFeedback(e instanceof Error ? e.message : "Échec de l'export projets.", "error");
    }
  };

  const handleImportProjects = async (file: File | null) => {
    if (!file) return;
    const run = async () => {
      const text = await file.text();
      const res = await importProjectsJson(text);
      if (res.error) {
        throw new Error(res.error);
      }
      await onReloadProjects();
      setProjectFeedback(`${res.imported} projet(s) importé(s).`);
    };
    await runProjectAction(run, run);
  };

  const runHistoryAction = async (action: () => Promise<void>, retry?: () => Promise<void>) => {
    setHistoryBusy(true);
    setHistoryOpError(null);
    setRetryHistoryAction(null);
    try {
      await action();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur lors de l'opération historique.";
      setHistoryOpError(msg);
      if (retry) setRetryHistoryAction(() => retry);
    } finally {
      setHistoryBusy(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: typeof UserCog }[] = [
    { id: "profil", label: "Profil de personnalité", icon: UserCog },
    { id: "memoire", label: "Gestion de mémoire", icon: Brain },
    { id: "projets", label: "Projets et objectifs", icon: Target },
    { id: "historique", label: "Historique", icon: Clock3 },
  ];

  const renderErrorBanner = (
    message: string | null | undefined,
    onRetry?: (() => Promise<void>) | null,
    retryLabel = "Réessayer"
  ) => {
    if (!message) return null;
    return (
      <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-3.5 py-2.5 flex flex-wrap items-center gap-2 text-xs text-red-100">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-[180px]">{message}</span>
        {onRetry && (
          <button type="button" onClick={() => void onRetry()} className="inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-lg border border-red-300/30 hover:bg-red-500/10 cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" />{retryLabel}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col px-4 py-5 sm:px-6 lg:px-8">
      <div className="max-w-6xl w-full mx-auto flex-1 min-h-0 flex flex-col gap-4">
        <header className="space-y-1 shrink-0">
          <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            Espace Intelligence
          </h1>
          <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Personnalité, mémoire évolutive, projets/objectifs et historique des suggestions, décisions et mises à jour.
          </p>
        </header>

        <div className="flex flex-wrap gap-2 shrink-0">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 min-h-[42px] px-3.5 rounded-xl border text-sm font-medium cursor-pointer transition-colors ${
                  active
                    ? extremeDark
                      ? "bg-cyan-950/40 border-cyan-500/35 text-cyan-100"
                      : "bg-cyan-500/15 border-cyan-400/35 text-cyan-50"
                    : extremeDark
                    ? "border-white/[0.07] text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                    : "border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === "profil" && (
            <div className="jarvis-scroll h-full overflow-y-auto pr-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-2">
                <section className={`${card} space-y-4`}>
                  <div className="flex items-center gap-2 text-cyan-200 font-medium"><SlidersHorizontal className="w-4 h-4" />Profil de personnalité</div>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Nom d'affichage (optionnel)</span>
                    <input className={`${inputCls} w-full`} value={profile.displayName || ""} onChange={(e) => onUpdateProfile({ displayName: e.target.value })} placeholder="Ex: Monsieur" />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Ton de base</span>
                    <select className={`${inputCls} w-full`} value={profile.baseTone} onChange={(e) => onUpdateProfile({ baseTone: e.target.value as IntelligenceProfile["baseTone"] })}>
                      <option value="elegant">Élégant</option>
                      <option value="friendly">Amical</option>
                      <option value="direct">Direct</option>
                      <option value="formal">Formel</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Niveau de détail préféré</span>
                    <select className={`${inputCls} w-full`} value={profile.detailPreference} onChange={(e) => onUpdateProfile({ detailPreference: e.target.value as IntelligenceProfile["detailPreference"] })}>
                      <option value="concise">Concis</option>
                      <option value="balanced">Équilibré</option>
                      <option value="detailed">Détaillé</option>
                    </select>
                  </label>
                  {([
                    { key: "humorLevel", label: "Humour" },
                    { key: "sarcasmLevel", label: "Sarcasme léger" },
                    { key: "proactivityLevel", label: "Initiative (suggestions)" },
                  ] as const).map((s) => (
                    <label key={s.key} className="block space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{s.label}</span>
                        <span className="font-mono-tabular text-slate-300">{Math.round(profile[s.key] * 100)}%</span>
                      </div>
                      <input type="range" min={0} max={100} value={Math.round(profile[s.key] * 100)} onChange={(e) => onUpdateProfile({ [s.key]: Number(e.target.value) / 100 } as any)} className="w-full accent-cyan-400 cursor-pointer" />
                    </label>
                  ))}
                </section>

                <section className={`${card} space-y-4`}>
                  <div className="flex items-center gap-2 text-cyan-200 font-medium"><Brain className="w-4 h-4" />Comportement & fiabilité</div>
                  <div className="space-y-3 text-sm">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={profile.askWhenMissingInfo} onChange={(e) => onUpdateProfile({ askWhenMissingInfo: e.target.checked })} className="mt-1 accent-cyan-400" />
                      <span className="text-slate-200">Demander une précision lorsqu'une information essentielle manque (évite les suppositions).</span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox" checked={profile.memoryEnabled} onChange={(e) => { onUpdateProfile({ memoryEnabled: e.target.checked }); onSetMemoryEnabled(e.target.checked); }} className="mt-1 accent-cyan-400" />
                      <span className="text-slate-200">Activer la mémoire évolutive (souvenirs centraux et contextes par mode).</span>
                    </label>
                    <div className="flex items-start gap-3 opacity-80">
                      <input type="checkbox" checked={false} disabled className="mt-1 accent-cyan-400" />
                      <span className="text-slate-400">Enregistrement automatique d'informations sensibles : désactivé (sécurité). Toute mémorisation sensible nécessite une autorisation explicite.</span>
                    </div>
                  </div>
                  <div className={`rounded-xl border p-3 text-xs leading-relaxed ${extremeDark ? "border-cyan-500/20 bg-cyan-950/10 text-slate-300" : "border-cyan-400/20 bg-cyan-500/5 text-slate-300"}`}>
                    <p className="font-medium text-cyan-200 mb-1">Règles appliquées</p>
                    <ul className="space-y-1 list-disc pl-4">
                      <li>Gemini reste le cerveau principal et le moteur vocal existant est respecté.</li>
                      <li>Aucune action externe non autorisée (messages, publications, modifications/suppressions de fichiers).</li>
                      <li>Les souvenirs sensibles ne sont pas enregistrés automatiquement sans autorisation explicite.</li>
                      <li>Les explications sont fournies sans exposer de prétendues pensées internes privées.</li>
                      <li>Les informations obsolètes/incertaines et les limites doivent être signalées.</li>
                    </ul>
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === "memoire" && (
            <div className="h-full min-h-0 flex flex-col">
              <p className={`text-[11px] px-1 pb-1 ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                Cette vue utilise la même mémoire que l&apos;espace dédié « Mémoire » : aucune donnée n&apos;est dupliquée.
              </p>
              <div className="flex-1 min-h-0 -mx-4 sm:-mx-6 lg:-mx-8">
                <MemoryView
                  memories={memories}
                  extremeDark={extremeDark}
                  memoryEnabled={memoryEnabled}
                  onAddMemory={onAddMemory}
                  onUpdateMemory={onUpdateMemory}
                  onTogglePinMemory={onTogglePinMemory}
                  onToggleDisableMemory={onToggleDisableMemory}
                  onRemoveMemory={onRemoveMemory}
                  onSetMemoryEnabled={onSetMemoryEnabled}
                  onReloadMemories={onReloadMemories}
                />
              </div>
            </div>
          )}

          {tab === "projets" && (
            <div className="jarvis-scroll h-full overflow-y-auto pr-1">
              <div className="space-y-3 pb-2">
                {projectsLoading && (
                  <div className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2 text-sm ${extremeDark ? "border-cyan-500/20 bg-cyan-950/10 text-cyan-100" : "border-cyan-400/20 bg-cyan-500/5 text-cyan-100"}`}>
                    <Loader2 className="w-4 h-4 animate-spin" />Chargement des projets...
                  </div>
                )}
                {renderErrorBanner(projectsError, onReloadProjects, "Réessayer le chargement")}
                {renderErrorBanner(projectOpError, retryProjectAction, "Réessayer l'action")}
                {projectMsg && (
                  <div className={`rounded-xl border px-3.5 py-2.5 text-xs ${projectMsgKind === "error" ? "border-red-400/25 bg-red-500/10 text-red-100" : "border-cyan-400/20 bg-cyan-500/10 text-cyan-100"}`}>
                    {projectMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
                  <section className={`${card} space-y-4`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-cyan-200 font-medium"><Target className="w-4 h-4" />Projets</div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => void onReloadProjects()} className={btnGhost} title="Recharger les projets" disabled={projectsLoading || projectBusy}><RefreshCw className={`w-4 h-4 ${projectsLoading ? "animate-spin" : ""}`} /></button>
                        <button type="button" onClick={handleExportProjects} className={btnGhost} title="Exporter les projets" disabled={projectBusy}><Download className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <label className={`${btnGhost} justify-center w-full relative ${projectBusy ? "opacity-40 pointer-events-none" : ""}`}>
                      <Upload className="w-4 h-4" />Importer projets
                      <input type="file" accept="application/json" className="absolute inset-0 opacity-0 cursor-pointer" disabled={projectBusy} onChange={(e) => { void handleImportProjects(e.target.files?.[0] || null); e.target.value = ""; }} />
                    </label>

                    <form onSubmit={handleCreateProject} className="space-y-2">
                      <input className={`${inputCls} w-full`} value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Nouveau projet" disabled={projectBusy} />
                      <input className={`${inputCls} w-full`} value={newProjectObjective} onChange={(e) => setNewProjectObjective(e.target.value)} placeholder="Objectif (optionnel)" disabled={projectBusy} />
                      <button type="submit" disabled={!newProjectName.trim() || projectBusy} className={`${btnPrimary} w-full justify-center`}>
                        {projectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Créer
                      </button>
                    </form>

                    <div className="space-y-2">
                      {projects.length === 0 && !projectsLoading ? (
                        <p className="text-sm text-slate-500">Aucun projet pour le moment.</p>
                      ) : (
                        projects.map((p) => {
                          const active = effectiveSelectedId === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedProjectId(p.id)}
                              className={`w-full text-left rounded-xl border p-3 space-y-1.5 cursor-pointer transition-colors ${
                                active
                                  ? "border-cyan-400/35 bg-cyan-500/10"
                                  : extremeDark
                                  ? "border-white/[0.06] hover:bg-white/[0.03]"
                                  : "border-white/[0.08] hover:bg-white/[0.04]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-slate-100 truncate">{p.name}</span>
                                <span className="text-[11px] text-slate-400">{p.progress}%</span>
                              </div>
                              <div className="text-[11px] text-slate-400">{STATUS_LABELS[p.status]}</div>
                              <ProgressBar value={p.progress} extremeDark={extremeDark} />
                            </button>
                          );
                        })
                      )}
                    </div>
                  </section>

                  <section className={`${card} space-y-4 min-h-[300px]`}>
                    {!selectedProject ? (
                      <div className="h-full flex items-center justify-center text-sm text-slate-500">Sélectionnez ou créez un projet pour gérer objectifs, tâches, blocages et prochaines actions.</div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <input
                              className={`${inputCls} w-full text-base font-medium`}
                              value={selectedProject.name}
                              onChange={(e) => void updateSelectedProject((p) => ({ ...p, name: e.target.value }))}
                              aria-label="Nom du projet"
                              disabled={projectBusy}
                            />
                            <textarea
                              className={`${inputCls} w-full h-auto min-h-[72px] py-2.5`}
                              value={selectedProject.objective || ""}
                              onChange={(e) => void updateSelectedProject((p) => ({ ...p, objective: e.target.value || undefined }))}
                              placeholder="Objectif du projet"
                              aria-label="Objectif"
                              disabled={projectBusy}
                            />
                          </div>
                          <button type="button" onClick={() => { if (confirm("Supprimer ce projet ?")) { const run = async () => { await onRemoveProject(selectedProject.id); setProjectFeedback("Projet supprimé."); }; void runProjectAction(run, run); } }} className={btnDanger} disabled={projectBusy}><Trash2 className="w-4 h-4" />Supprimer</button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <label className="space-y-1">
                            <span className="text-xs text-slate-400">Statut</span>
                            <select className={`${inputCls} w-full`} value={selectedProject.status} onChange={(e) => void updateSelectedProject((p) => ({ ...p, status: e.target.value as ProjectStatus }))} disabled={projectBusy}>
                              {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                            </select>
                          </label>
                          <div className="space-y-1 sm:col-span-2">
                            <div className="flex items-center justify-between text-xs text-slate-400"><span>Progression</span><span className="font-mono-tabular text-slate-200">{selectedProject.progress}%</span></div>
                            <div className="pt-2"><ProgressBar value={selectedProject.progress} extremeDark={extremeDark} /></div>
                            <p className="text-[11px] text-slate-500">Calculée automatiquement à partir des tâches/sous-tâches terminées.</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-cyan-200"><BarChart3 className="w-4 h-4" />Tâches et sous-tâches {projectBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />}</div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input className={`${inputCls} flex-1`} value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} placeholder={subtaskTarget ? "Nouvelle sous-tâche..." : "Nouvelle tâche..."} disabled={projectBusy} />
                            <button type="button" onClick={() => void handleAddTask()} disabled={!taskDraft.trim() || projectBusy} className={btnPrimary}><Plus className="w-4 h-4" />Ajouter</button>
                            {subtaskTarget && <button type="button" onClick={() => setSubtaskTarget(null)} className={btnGhost} disabled={projectBusy}><X className="w-4 h-4" />Annuler sous-tâche</button>}
                          </div>
                          {subtaskTarget && <p className="text-xs text-cyan-300">Ajout d'une sous-tâche à la tâche sélectionnée.</p>}
                          <div className="space-y-2">
                            {selectedProject.tasks.length === 0 ? (
                              <p className="text-sm text-slate-500">Aucune tâche.</p>
                            ) : (
                              selectedProject.tasks.map((t) => (
                                <TaskRow
                                  key={t.id}
                                  project={selectedProject}
                                  task={t}
                                  depth={0}
                                  extremeDark={extremeDark}
                                  onChangeStatus={(taskId, status) => void updateSelectedProject((p) => setTaskStatus(p, taskId, status))}
                                  onAddSubtask={(parentTaskId) => { setSubtaskTarget(parentTaskId); }}
                                  onDelete={(taskId) => void updateSelectedProject((p) => removeTask(p, taskId))}
                                />
                              ))
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium text-cyan-200"><AlertTriangle className="w-4 h-4" />Blocages</div>
                            <div className="flex gap-2">
                              <input className={`${inputCls} flex-1`} value={blockerDraft} onChange={(e) => setBlockerDraft(e.target.value)} placeholder="Nouveau blocage..." disabled={projectBusy} />
                              <button type="button" onClick={() => { if (!blockerDraft.trim()) return; const desc = blockerDraft.trim(); void runProjectAction(async () => { await onSaveProject(addBlocker(selectedProject, desc)); setBlockerDraft(""); setProjectFeedback("Blocage ajouté."); }, async () => { await onSaveProject(addBlocker(selectedProject, desc)); }); }} className={btnPrimary} disabled={!blockerDraft.trim() || projectBusy}><Plus className="w-4 h-4" /></button>
                            </div>
                            <div className="space-y-1.5">
                              {selectedProject.blockers.length === 0 ? <p className="text-sm text-slate-500">Aucun blocage.</p> : selectedProject.blockers.map((b) => (
                                <div key={b.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${extremeDark ? "border-white/[0.06]" : "border-white/[0.08]"}`}>
                                  <span className={`flex-1 ${b.resolvedAt ? "text-slate-500 line-through" : "text-slate-200"}`}>{b.description || "Blocage"}</span>
                                  {!b.resolvedAt ? (
                                    <button type="button" disabled={projectBusy} onClick={() => void updateSelectedProject((p) => resolveBlocker(p, b.id))} className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 cursor-pointer disabled:opacity-40"><Check className="w-3.5 h-3.5" />Résolu</button>
                                  ) : (
                                    <span className="text-xs text-slate-500">Résolu</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium text-cyan-200"><Save className="w-4 h-4" />Prochaines actions</div>
                            <div className="flex gap-2">
                              <input className={`${inputCls} flex-1`} value={nextActionDraft} onChange={(e) => setNextActionDraft(e.target.value)} placeholder="Prochaine action..." disabled={projectBusy} />
                              <button type="button" onClick={() => { if (!nextActionDraft.trim()) return; const action = nextActionDraft.trim(); void runProjectAction(async () => { await onSaveProject({ ...selectedProject, nextActions: [...selectedProject.nextActions, action] }); setNextActionDraft(""); setProjectFeedback("Prochaine action ajoutée."); }, async () => { await onSaveProject({ ...selectedProject, nextActions: [...selectedProject.nextActions, action] }); }); }} className={btnPrimary} disabled={!nextActionDraft.trim() || projectBusy}><Plus className="w-4 h-4" /></button>
                            </div>
                            <div className="space-y-1.5">
                              {selectedProject.nextActions.length === 0 ? <p className="text-sm text-slate-500">Aucune action définie.</p> : selectedProject.nextActions.map((a, i) => (
                                <div key={`${a}-${i}`} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${extremeDark ? "border-white/[0.06]" : "border-white/[0.08]"}`}>
                                  <span className="flex-1 text-slate-200">{a}</span>
                                  <button type="button" disabled={projectBusy} onClick={() => void updateSelectedProject((p) => ({ ...p, nextActions: p.nextActions.filter((_, idx) => idx !== i) }))} className="text-slate-500 hover:text-red-300 cursor-pointer disabled:opacity-40" aria-label="Supprimer l'action"><X className="w-4 h-4" /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-cyan-200"><Link2 className="w-4 h-4" />Conversations liées</div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <select className={`${inputCls} flex-1`} value={linkSessionId} onChange={(e) => setLinkSessionId(e.target.value)} disabled={projectBusy}>
                              <option value="">Associer une conversation...</option>
                              {sessions.map((s) => (
                                <option key={s.id} value={s.id}>{s.title || "Conversation"} — {formatDateTime(s.updatedAt || s.createdAt)}</option>
                              ))}
                            </select>
                            <button type="button" className={btnPrimary} disabled={!linkSessionId || projectBusy} onClick={() => { const s = sessions.find((x) => x.id === linkSessionId); if (!s) return; void runProjectAction(async () => { await onSaveProject(linkConversation(selectedProject, s.id, s.title)); setLinkSessionId(""); setProjectFeedback("Conversation liée."); }, async () => { await onSaveProject(linkConversation(selectedProject, s.id, s.title)); }); }}>
                              <Link2 className="w-4 h-4" />Lier
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedProject.linkedConversationIds.length === 0 ? (
                              <p className="text-sm text-slate-500">Aucune conversation liée.</p>
                            ) : (
                              selectedProject.linkedConversationIds.map((id, idx) => (
                                <span key={id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${extremeDark ? "border-white/[0.08] text-slate-300" : "border-cyan-400/20 text-slate-200"}`}>
                                  {selectedProject.linkedConversationTitles[idx] || id}
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs text-slate-400">Notes</span>
                          <textarea className={`${inputCls} w-full h-auto min-h-[90px] py-2.5`} value={selectedProject.notes || ""} onChange={(e) => void updateSelectedProject((p) => ({ ...p, notes: e.target.value || undefined }))} placeholder="Notes, décisions, contexte du projet..." disabled={projectBusy} />
                        </div>
                      </>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}

          {tab === "historique" && (
            <div className="jarvis-scroll h-full overflow-y-auto pr-1">
              <section className={`${card} space-y-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-cyan-200 font-medium"><Clock3 className="w-4 h-4" />Historique intelligence</div>
                  <div className="flex items-center gap-2">
                    {onReloadHistory && (
                      <button type="button" onClick={() => void onReloadHistory()} className={btnGhost} disabled={historyLoading || historyBusy} title="Recharger l'historique">
                        <RefreshCw className={`w-4 h-4 ${historyLoading ? "animate-spin" : ""}`} />Recharger
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const action = async () => {
                          await onAddHistory({ type: "suggestion", title: "Suggestion manuelle", detail: "Entrée ajoutée depuis l'Espace Intelligence.", level: "info" });
                        };
                        void runHistoryAction(action, action);
                      }}
                      className={btnGhost}
                      disabled={historyBusy}
                    >
                      {historyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Ajouter une note
                    </button>
                    <button type="button" onClick={() => { if (confirm("Effacer l'historique intelligence ?")) { const action = async () => { await onClearHistory(); }; void runHistoryAction(action, action); } }} className={btnDanger} disabled={historyBusy}>
                      <Trash2 className="w-4 h-4" />Effacer
                    </button>
                  </div>
                </div>
                <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
                  Journal local des suggestions, décisions, mises à jour de mémoire/projets et événements de fiabilité. Les actions externes ne sont jamais exécutées sans autorisation explicite.
                </p>
                {historyLoading && (
                  <div className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2 text-sm ${extremeDark ? "border-cyan-500/20 bg-cyan-950/10 text-cyan-100" : "border-cyan-400/20 bg-cyan-500/5 text-cyan-100"}`}>
                    <Loader2 className="w-4 h-4 animate-spin" />Chargement de l'historique...
                  </div>
                )}
                {renderErrorBanner(historyError, onReloadHistory ? () => onReloadHistory() : null, "Réessayer le chargement")}
                {renderErrorBanner(historyOpError, retryHistoryAction, "Réessayer l'action")}
                {history.length === 0 && !historyLoading ? (
                  <div className={`rounded-xl border p-6 text-sm text-center ${extremeDark ? "border-white/[0.06] text-slate-500" : "border-white/[0.08] text-slate-500"}`}>Aucun événement pour le moment.</div>
                ) : (
                  <ul className="space-y-2.5">
                    {history.map((ev) => (
                      <li key={ev.id} className={`rounded-xl border p-3.5 ${extremeDark ? "border-white/[0.06] bg-white/[0.02]" : "border-white/[0.08] bg-white/[0.03]"}`}>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className={`px-2 py-0.5 rounded-full border ${ev.level === "warning" ? "border-amber-400/30 text-amber-200" : ev.level === "success" ? "border-emerald-400/30 text-emerald-200" : "border-cyan-400/25 text-cyan-200"}`}>
                            {ev.type}
                          </span>
                          <span className="font-mono-tabular">{formatDateTime(ev.createdAt)}</span>
                          {ev.relatedProjectId && <span>Projet: {ev.relatedProjectId.slice(0, 8)}…</span>}
                          {ev.relatedConversationId && <span>Conversation liée</span>}
                        </div>
                        <p className="mt-1.5 text-sm text-slate-100 font-medium">{ev.title}</p>
                        {ev.detail && <p className="mt-1 text-sm text-slate-400 leading-relaxed">{ev.detail}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
