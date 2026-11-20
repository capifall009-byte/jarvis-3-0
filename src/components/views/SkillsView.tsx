/**
 * Vue additive « Skills » — moteur de compétences déclaratives (Phase 3).
 *
 * Aucune génération ni exécution de code arbitraire : l'interface ne produit
 * que des workflows { template, json, assert } validés côté serveur avant
 * enregistrement et avant activation. Le chat Gemini n'est pas modifié.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Layers,
  Pencil,
  Play,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import { SENSITIVE_ACTIONS } from "../../core/types.ts";
import type { CoreSensitiveAction, CoreStatus } from "../../core/types.ts";
import type {
  NewSkillInput,
  SkillDefinition,
  SkillExecution,
  SkillParameter,
  SkillStatus,
  SkillStep,
  SkillTestCase,
  ValidationIssue,
} from "../../core/skills/types.ts";
import { coreClient } from "../../services/core/CoreClient.ts";
import type { AppView } from "../../types/jarvis.ts";

interface SkillsViewProps {
  isOnline: boolean;
  extremeDark: boolean;
  onNavigate?: (view: AppView) => void;
}

const PARAMETERS_EXAMPLE = `[
  { "name": "topic", "type": "string", "required": true, "maxLength": 200, "description": "Sujet" },
  { "name": "lang", "type": "string", "default": "fr", "description": "Langue" }
]`;

const STEPS_EXAMPLE = `[
  { "id": "build", "kind": "template", "template": "Synthèse {{params.topic}} ({{params.lang}})" },
  { "id": "verify", "kind": "assert", "value": "{{steps.build}}", "check": "contains", "expected": "{{params.topic}}" },
  { "id": "package", "kind": "json", "fields": { "resume": "{{steps.build}}", "subject": "{{params.topic}}" } }
]`;

const TESTS_EXAMPLE = `[
  { "name": "cas nominal", "input": { "topic": "JARVIS", "lang": "fr" }, "expect": { "contains": "JARVIS" } }
]`;

const STATUS_STYLE: Record<SkillStatus, string> = {
  draft: "border-slate-500/30 text-slate-300 bg-slate-500/10",
  validated: "border-cyan-400/30 text-cyan-200 bg-cyan-500/10",
  active: "border-emerald-400/30 text-emerald-200 bg-emerald-500/10",
  disabled: "border-amber-400/30 text-amber-200 bg-amber-500/10",
  failed: "border-red-400/30 text-red-200 bg-red-500/10",
};

function Badge({ status }: { status: SkillStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono tracking-wider ${STATUS_STYLE[status] ?? STATUS_STYLE.draft}`}>
      {status.toUpperCase()}
    </span>
  );
}

function parseArray<T>(raw: string, label: string): { value: T[]; error: string | null } {
  if (!raw.trim()) return { value: [], error: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { value: [], error: `${label} doit être un tableau JSON.` };
    return { value: parsed as T[], error: null };
  } catch {
    return { value: [], error: `${label} : JSON invalide.` };
  }
}

function emptyForm() {
  return {
    name: "",
    description: "",
    category: "general",
    tags: "",
    expectedResult: "",
    parameters: PARAMETERS_EXAMPLE,
    steps: STEPS_EXAMPLE,
    tests: TESTS_EXAMPLE,
    permissions: [] as CoreSensitiveAction[],
  };
}

type SkillForm = ReturnType<typeof emptyForm>;

export function SkillsView({ isOnline, extremeDark, onNavigate }: SkillsViewProps) {
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [executions, setExecutions] = useState<SkillExecution[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [runInputs, setRunInputs] = useState<Record<string, string>>({});
  const [runGoal, setRunGoal] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);

  const selected = skills.find((s) => s.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextSkills, nextCategories, nextExecutions] = await Promise.all([
        coreClient.getStatus(),
        coreClient.getSkills(),
        coreClient.getSkillCategories(),
        coreClient.getSkillExecutions({ limit: 25 }),
      ]);
      setStatus(nextStatus);
      setSkills(nextSkills);
      setCategories(nextCategories);
      setExecutions(nextExecutions);
      setSelectedId((current) => (current && nextSkills.some((s) => s.id === current) ? current : nextSkills[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le moteur de Skills.");
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void load();
  }, [isOnline, load]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const param of selected?.parameters ?? []) {
      next[param.name] = param.default !== undefined ? String(param.default) : "";
    }
    setRunInputs(next);
    setOutput(null);
  }, [selected?.id, selected?.version]);

  const buildInput = (): { input: NewSkillInput | null; error: string | null } => {
    const parameters = parseArray<SkillParameter>(form.parameters, "Paramètres");
    const steps = parseArray<SkillStep>(form.steps, "Étapes");
    const tests = parseArray<SkillTestCase>(form.tests, "Tests");
    const firstError = parameters.error ?? steps.error ?? tests.error;
    if (firstError) return { input: null, error: firstError };
    return {
      input: {
        name: form.name,
        description: form.description,
        category: form.category,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        expectedResult: form.expectedResult,
        parameters: parameters.value,
        steps: steps.value,
        tests: tests.value,
        permissions: form.permissions,
      },
      error: null,
    };
  };

  const runAction = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  };

  const validateForm = async () => {
    const built = buildInput();
    if (built.error) {
      setError(built.error);
      setIssues([]);
      return;
    }
    await runAction(async () => {
      const result = await coreClient.validateSkill(built.input);
      setIssues(result.issues);
      if (result.valid) setNotice("Définition valide. Vous pouvez enregistrer la compétence.");
      else setError("Définition invalide : corrigez les erreurs ci-dessous.");
    });
  };

  const saveSkill = async () => {
    const built = buildInput();
    if (built.error || !built.input) {
      setError(built.error ?? "Définition invalide.");
      return;
    }
    const validation = await coreClient.validateSkill(built.input);
    setIssues(validation.issues);
    if (!validation.valid) {
      setError("Définition refusée par le validateur : corrigez les erreurs ci-dessous.");
      return;
    }
    await runAction(async () => {
      if (editingId) {
        await coreClient.updateSkill(editingId, built.input!);
        setNotice("Nouvelle version enregistrée. Un test est requis avant réactivation.");
      } else {
        const created = await coreClient.createSkill(built.input!);
        setSelectedId(created.id);
        setNotice(`Compétence « ${created.name} » créée en version ${created.version}.`);
      }
      setEditingId(null);
      setEditorOpen(false);
      setForm(emptyForm());
    });
  };

  const startEdit = (skill: SkillDefinition) => {
    setEditingId(skill.id);
    setForm({
      name: skill.name,
      description: skill.description,
      category: skill.category,
      tags: skill.tags.join(", "),
      expectedResult: skill.expectedResult,
      parameters: JSON.stringify(skill.parameters, null, 2),
      steps: JSON.stringify(skill.steps, null, 2),
      tests: JSON.stringify(skill.tests, null, 2),
      permissions: skill.permissions,
    });
    setIssues([]);
    setEditorOpen(true);
  };

  const runSkill = async () => {
    if (!selected) return;
    const payload: Record<string, string | number | boolean> = {};
    for (const param of selected.parameters) {
      const raw = runInputs[param.name] ?? "";
      if (raw === "" && !param.required && param.default === undefined) continue;
      if (param.type === "number") {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          setError(`Paramètre « ${param.name} » : nombre invalide.`);
          return;
        }
        payload[param.name] = numeric;
      } else if (param.type === "boolean") {
        payload[param.name] = raw === "true";
      } else {
        payload[param.name] = raw;
      }
    }
    await runAction(async () => {
      const result = await coreClient.executeSkill(selected.id, payload, runGoal || undefined);
      setOutput(result.output ?? result.execution.error ?? "(aucune sortie)");
      setNotice(`Exécution ${result.execution.status} · ${result.execution.stepCount} étape(s) · ${result.execution.durationMs} ms`);
    });
  };

  const visibleSkills = skills.filter((skill) => {
    if (category && skill.category !== category) return false;
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return `${skill.name} ${skill.description} ${skill.category} ${skill.tags.join(" ")}`.toLowerCase().includes(needle);
  });

  const panel = extremeDark ? "bg-black/60 border-white/[0.07]" : "jarvis-glass border-cyan-400/15";

  if (!isOnline) {
    return (
      <div className="flex-1 grid place-items-center p-6">
        <div className={`max-w-md rounded-2xl border p-6 text-center ${panel}`}>
          <AlertTriangle className="w-7 h-7 mx-auto mb-3 text-amber-300" />
          <p className="text-sm text-slate-200">Le moteur de Skills nécessite une connexion au serveur.</p>
          <p className="mt-2 text-xs text-slate-400">Le chat local, la mémoire et les conversations restent inchangés.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto jarvis-scroll p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-cyan-300" />
            <h1 className="font-display text-lg tracking-[0.16em] text-cyan-50">COMPÉTENCES DYNAMIQUES</h1>
            <span className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] font-mono text-cyan-300">4.0 · PHASE 3</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Workflows déclaratifs validés : template, JSON et assertions. Aucune génération ni exécution de code.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:text-cyan-200 cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate("missions")} className="rounded-xl border border-cyan-400/25 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/10 cursor-pointer">
              Voir les missions
            </button>
          )}
        </div>
      </header>

      <div className={`rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200/90`}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Stockage local uniquement : les compétences ne sont pas synchronisées entre appareils.
            Une Skill ne peut être activée qu&apos;après validation stricte et test intégré réussi.
            STOP GLOBAL bloque immédiatement toute exécution.
          </span>
        </div>
      </div>

      {status?.stopActive && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-red-200">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>STOP GLOBAL actif — exécution des compétences bloquée.</span>
            </div>
            {confirmResume ? (
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy} onClick={() => void runAction(async () => {
                  await coreClient.resumeCore("Reprise depuis l'interface Skills");
                  setConfirmResume(false);
                }, "STOP GLOBAL levé. Les missions restent en pause.")} className="rounded-lg border border-red-400/50 bg-red-500/20 px-3 py-1.5 text-[11px] text-red-100 cursor-pointer">Confirmer la reprise</button>
                <button type="button" onClick={() => setConfirmResume(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-300 cursor-pointer">Annuler</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmResume(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 py-1.5 text-[11px] text-emerald-200 cursor-pointer">
                <Power className="w-3 h-3" /> Reprendre
              </button>
            )}
          </div>
        </div>
      )}

      {error && <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs text-emerald-200">{notice}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs uppercase tracking-[0.14em] text-cyan-200">
              {editingId ? `Modifier v${selected?.version ?? "?"}` : "Nouvelle compétence"}
            </h2>
            <button type="button" onClick={() => {
              setEditorOpen((v) => !v);
              if (editorOpen) { setEditingId(null); setForm(emptyForm()); setIssues([]); }
            }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-300 cursor-pointer">
              {editorOpen ? <XCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {editorOpen ? "Fermer" : "Éditeur"}
            </button>
          </div>

          {editorOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[11px] text-slate-400">
                  Nom
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Synthèse de recherche" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/40" />
                </label>
                <label className="block text-[11px] text-slate-400">
                  Catégorie
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="recherche" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/40" />
                </label>
              </div>
              <label className="block text-[11px] text-slate-400">
                Description
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Ce que fait la compétence…" className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/40" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-[11px] text-slate-400">
                  Tags (séparés par des virgules)
                  <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="recherche, synthese" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/40" />
                </label>
                <label className="block text-[11px] text-slate-400">
                  Résultat attendu
                  <input value={form.expectedResult} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} placeholder="Un rapport structuré…" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/40" />
                </label>
              </div>

              <details className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
                <summary className="cursor-pointer text-[11px] text-amber-200/90">Permissions sensibles ({form.permissions.length}) — fail closed</summary>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {SENSITIVE_ACTIONS.map((action) => {
                    const checked = form.permissions.includes(action);
                    return (
                      <label key={action} className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={() => setForm({
                          ...form,
                          permissions: checked
                            ? form.permissions.filter((p) => p !== action)
                            : [...form.permissions, action],
                        })} className="accent-cyan-400" />
                        <span className="truncate">{action}</span>
                      </label>
                    );
                  })}
                </div>
              </details>

              <label className="block text-[11px] text-slate-400">
                Paramètres (JSON)
                <textarea value={form.parameters} onChange={(e) => setForm({ ...form, parameters: e.target.value })} rows={4} spellCheck={false} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-[10px] text-cyan-100/90 focus:outline-none focus:border-cyan-400/40" />
              </label>
              <label className="block text-[11px] text-slate-400">
                Étapes (JSON — template / json / assert)
                <textarea value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} rows={7} spellCheck={false} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-[10px] text-cyan-100/90 focus:outline-none focus:border-cyan-400/40" />
              </label>
              <label className="block text-[11px] text-slate-400">
                Tests intégrés (JSON — obligatoires avant activation)
                <textarea value={form.tests} onChange={(e) => setForm({ ...form, tests: e.target.value })} rows={4} spellCheck={false} className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-[10px] text-cyan-100/90 focus:outline-none focus:border-cyan-400/40" />
              </label>

              {issues.length > 0 && (
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-red-400/20 bg-red-500/[0.06] p-2 jarvis-scroll">
                  {issues.map((issue, index) => (
                    <li key={`${issue.path}-${index}`} className={`text-[10px] ${issue.severity === "error" ? "text-red-300" : "text-amber-300"}`}>
                      <span className="font-mono">{issue.path}</span> — {issue.message}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void validateForm()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:text-cyan-200 disabled:opacity-40 cursor-pointer">
                  <ShieldAlert className="w-3.5 h-3.5" /> Valider la définition
                </button>
                <button type="button" disabled={busy} onClick={() => void saveSkill()} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40 cursor-pointer">
                  <Layers className="w-3.5 h-3.5" /> {editingId ? "Enregistrer la version" : "Créer la compétence"}
                </button>
              </div>
            </div>
          )}

          {!editorOpen && (
            <p className="mt-3 text-xs text-slate-400">
              Définissez un workflow réutilisable : paramètres typés, étapes déclaratifs et tests intégrés.
              La validation refuse tout motif de code exécutable.
            </p>
          )}
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs uppercase tracking-[0.14em] text-cyan-200">Compétences ({skills.length})</h2>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> {status?.skills?.active ?? 0} actives
              <FlaskConical className="w-3.5 h-3.5 text-cyan-300" /> {status?.skills?.validated ?? 0} validées
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-2.5">
              <Search className="w-3.5 h-3.5 shrink-0 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full bg-transparent py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs text-slate-300 focus:outline-none">
              <option value="">Toutes catégories</option>
              {categories.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
            </select>
          </div>

          {visibleSkills.length === 0 ? (
            <p className="mt-4 text-xs text-slate-400">Aucune compétence. Ouvrez l&apos;éditeur pour en créer une.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {visibleSkills.map((skill) => (
                <article
                  key={skill.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === skill.id}
                  aria-label={`Sélectionner la compétence ${skill.name}`}
                  onClick={() => setSelectedId(skill.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(skill.id);
                    }
                  }}
                  className={`cursor-pointer rounded-xl border p-3 transition-colors ${selectedId === skill.id ? "border-cyan-400/40 bg-cyan-500/[0.07]" : "border-white/[0.07] bg-white/[0.02] hover:border-cyan-400/20"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-100">{skill.name} <span className="font-mono text-[10px] text-slate-500">v{skill.version}</span></p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{skill.description}</p>
                      <p className="mt-1 font-mono text-[10px] text-cyan-300/70">{skill.category} · {skill.steps.length} étapes · {skill.executionCount} exécution(s)</p>
                    </div>
                    <Badge status={skill.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {skill.tags.map((tag) => <span key={tag} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-slate-400">{tag}</span>)}
                    {skill.permissions.map((perm) => <span key={perm} className="rounded-full border border-amber-400/25 px-2 py-0.5 text-[10px] text-amber-300/90">{perm}</span>)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xs uppercase tracking-[0.14em] text-cyan-200">Détail · {selected.name}</h2>
              <p className="mt-1 font-mono text-[10px] text-slate-500">{selected.id} · v{selected.version} · créée le {new Date(selected.createdAt).toLocaleDateString("fr-FR")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void runAction(async () => {
                const result = await coreClient.testSkill(selected.id);
                setNotice(result.passed ? `${result.cases.length} test(s) réussi(s).` : `Test échoué : ${result.cases.filter((c) => !c.passed).map((c) => c.detail).join(" ; ")}`);
              })} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-[11px] text-cyan-200 cursor-pointer disabled:opacity-40"><FlaskConical className="w-3 h-3" /> Tester</button>

              {selected.status === "active" ? (
                <button type="button" disabled={busy} onClick={() => void runAction(async () => { await coreClient.disableSkill(selected.id); }, "Compétence désactivée.")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 px-3 py-1.5 text-[11px] text-amber-200 cursor-pointer disabled:opacity-40"><Power className="w-3 h-3" /> Désactiver</button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void runAction(async () => { await coreClient.enableSkill(selected.id); }, "Compétence activée.")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 px-3 py-1.5 text-[11px] text-emerald-200 cursor-pointer disabled:opacity-40"><Power className="w-3 h-3" /> Activer</button>
              )}

              <button type="button" onClick={() => startEdit(selected)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-300 cursor-pointer"><Pencil className="w-3 h-3" /> Modifier</button>

              {confirmDelete ? (
                <span className="inline-flex items-center gap-1.5">
                  <button type="button" disabled={busy} onClick={() => void runAction(async () => {
                    await coreClient.deleteSkill(selected.id);
                    setSelectedId(null);
                    setConfirmDelete(false);
                  }, "Compétence supprimée.")} className="rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-[11px] text-red-200 cursor-pointer">Confirmer</button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-300 cursor-pointer">Annuler</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/25 px-3 py-1.5 text-[11px] text-red-200 cursor-pointer"><Trash2 className="w-3 h-3" /> Supprimer</button>
              )}
            </div>
          </div>

          {selected.lastError && <p className="mt-2 rounded-lg border border-red-400/25 bg-red-500/[0.07] p-2 text-[11px] text-red-300">{selected.lastError}</p>}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <h3 className="text-[11px] uppercase tracking-wider text-cyan-200/90">Exécuter</h3>
              {selected.parameters.length === 0 && <p className="mt-2 text-[11px] text-slate-400">Aucun paramètre requis.</p>}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {selected.parameters.map((param) => (
                  <label key={param.name} className="block text-[11px] text-slate-400">
                    {param.name} <span className="text-slate-600">· {param.type}{param.required ? " · requis" : ""}</span>
                    {param.type === "boolean" ? (
                      <select value={runInputs[param.name] ?? "false"} onChange={(e) => setRunInputs({ ...runInputs, [param.name]: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 focus:outline-none">
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        type={param.type === "number" ? "number" : "text"}
                        value={runInputs[param.name] ?? ""}
                        onChange={(e) => setRunInputs({ ...runInputs, [param.name]: e.target.value })}
                        placeholder={param.default !== undefined ? String(param.default) : param.description ?? ""}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/40"
                      />
                    )}
                  </label>
                ))}
              </div>
              <label className="mt-2 block text-[11px] text-slate-400">
                Objectif transmis à la compétence (optionnel)
                <input value={runGoal} onChange={(e) => setRunGoal(e.target.value)} placeholder="Contexte de la mission…" className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none" />
              </label>
              <button type="button" disabled={busy || selected.status !== "active" || status?.stopActive} onClick={() => void runSkill()} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/15 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40 cursor-pointer">
                <Play className="w-3.5 h-3.5" /> Exécuter
              </button>
              {selected.status !== "active" && <p className="mt-2 text-[10px] text-amber-300/80">Activez la compétence après un test réussi pour l&apos;exécuter.</p>}
              {output !== null && (
                <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-white/[0.07] bg-black/40 p-2.5 font-mono text-[10px] whitespace-pre-wrap text-cyan-100/90 jarvis-scroll">{output}</pre>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <h3 className="text-[11px] uppercase tracking-wider text-cyan-200/90">Historique des versions</h3>
              <ul className="mt-2 space-y-1.5">
                {selected.history.slice().reverse().map((entry) => (
                  <li key={`${entry.version}-${entry.updatedAt}`} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-300">v{entry.version} · {entry.note}</span>
                    <span className="font-mono text-[10px] text-slate-500">{new Date(entry.updatedAt).toLocaleDateString("fr-FR")}</span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 text-[11px] uppercase tracking-wider text-cyan-200/90">Étapes déclaratives</h3>
              <ul className="mt-2 space-y-1">
                {selected.steps.map((step) => (
                  <li key={step.id} className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="font-mono text-cyan-300/80">{step.id}</span>
                    <span className="text-slate-600">·</span>
                    <span>{step.kind}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="text-xs uppercase tracking-[0.14em] text-cyan-200">Historique des exécutions</h2>
        {executions.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">Aucune exécution enregistrée.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {executions.map((execution) => (
              <li key={execution.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                <Clock3 className="w-3 h-3 text-slate-600" />
                <span className="font-mono text-slate-500">{new Date(execution.finishedAt).toLocaleTimeString("fr-FR")}</span>
                <span className="text-cyan-200/80">{execution.skillId} v{execution.skillVersion}</span>
                <span className={execution.status === "success" ? "text-emerald-300/80" : "text-red-300/80"}>{execution.status}</span>
                <span className="text-slate-500">{execution.stepCount} étape(s) · {execution.durationMs} ms</span>
                {execution.error && <span className="truncate text-red-300/70">{execution.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Square className="w-3 h-3" />
        <span>STOP GLOBAL reste prioritaire sur les Skills, les missions et le chat.</span>
        <XCircle className="w-3 h-3 ml-1" />
        <span>Aucune capacité non testée n&apos;est annoncée comme opérationnelle.</span>
      </div>
    </div>
  );
}
