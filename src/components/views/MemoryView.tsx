import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, Check, Download, EyeOff, Pencil, Pin, Plus, Search, ShieldOff, Trash2, Upload, X } from "lucide-react";
import type { MemoryCategory, MemoryItem } from "../../types/jarvis";
import { memoryRepository, normalizeMemoryCategory } from "../../services/memory/MemoryRepository";
import { detectMemoryContradictions } from "../../services/memory/MemoryContradictionService";

interface MemoryViewProps {
  memories: MemoryItem[];
  extremeDark: boolean;
  memoryEnabled?: boolean;
  onAddMemory: (fact: string, category: MemoryCategory) => void;
  onUpdateMemory: (id: string, fact: string, category: MemoryCategory) => void;
  onTogglePinMemory: (id: string) => void;
  onToggleDisableMemory?: (id: string) => void;
  onRemoveMemory: (id: string) => void;
  onSetMemoryEnabled?: (enabled: boolean) => void;
  onReloadMemories?: () => void;
}

const CATEGORIES: { id: MemoryCategory; label: string }[] = [
  { id: "profil_preferences", label: "Profil & préférences" },
  { id: "projets", label: "Projets" },
  { id: "objectifs", label: "Objectifs" },
  { id: "decisions", label: "Décisions" },
  { id: "habitudes_travail", label: "Habitudes de travail" },
  { id: "informations_importantes", label: "Informations importantes" },
  { id: "identite", label: "Identité (ancien)" },
  { id: "preference", label: "Préférence (ancien)" },
  { id: "projet", label: "Projet (ancien)" },
  { id: "consigne", label: "Consigne (ancien)" },
  { id: "autre", label: "Autre (ancien)" },
];

const CATEGORY_LABELS: Record<string, string> = {
  identite: "Identité",
  preference: "Préférence",
  projet: "Projet",
  consigne: "Consigne",
  autre: "Autre",
  profil_preferences: "Profil & préférences",
  projets: "Projets",
  objectifs: "Objectifs",
  decisions: "Décisions",
  habitudes_travail: "Habitudes de travail",
  informations_importantes: "Info importante",
};

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(ts));
}

export function MemoryView({
  memories,
  extremeDark,
  memoryEnabled = true,
  onAddMemory,
  onUpdateMemory,
  onTogglePinMemory,
  onToggleDisableMemory,
  onRemoveMemory,
  onSetMemoryEnabled,
  onReloadMemories,
}: MemoryViewProps) {
  const [filterCat, setFilterCat] = useState<"all" | MemoryCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [newFact, setNewFact] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("informations_importantes");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFact, setEditFact] = useState("");
  const [editCategory, setEditCategory] = useState<MemoryCategory>("informations_importantes");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [showContradictions, setShowContradictions] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Indicatif uniquement : aucune mémoire n'est modifiée ou supprimée automatiquement.
  const contradictions = useMemo(() => detectMemoryContradictions(memories), [memories]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return memories.filter((m) => {
      const cat = (m.category ?? "autre") as MemoryCategory;
      const norm = normalizeMemoryCategory(cat);
      if (filterCat !== "all" && cat !== filterCat && norm !== filterCat) return false;
      if (q && !m.fact.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [memories, filterCat, searchQuery]);

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newFact.trim();
    if (!trimmed) return;
    onAddMemory(trimmed, newCategory);
    setNewFact("");
  };

  const handleExport = () => {
    const json = memoryRepository.exportMemories();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-memoires-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const res = memoryRepository.importMemories(text);
      if (res.error) setImportMsg(`Import échoué : ${res.error}`);
      else {
        setImportMsg(`${res.imported} souvenir(s) importé(s)/restauré(s).`);
        onReloadMemories?.();
      }
      window.setTimeout(() => setImportMsg(null), 4500);
    } catch (e) {
      setImportMsg(`Import échoué : ${e instanceof Error ? e.message : "erreur"}`);
    }
  };

  const startEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditFact(item.fact);
    setEditCategory((item.category ?? "informations_importantes") as MemoryCategory);
  };

  const saveEdit = (id: string) => {
    const trimmed = editFact.trim();
    if (!trimmed) return;
    onUpdateMemory(id, trimmed, editCategory);
    setEditingId(null);
  };

  const cardCls = `rounded-2xl border p-4 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"}`;

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            Mémoire évolutive
          </h1>
          <p className={`text-sm leading-relaxed ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Souvenirs durables (profil & préférences, projets, objectifs, décisions, habitudes de travail, informations importantes). Mémoire centrale et contextes par mode préservés. Vous pouvez consulter, modifier, supprimer, désactiver, exporter et restaurer les données. Les informations sensibles ne doivent pas être enregistrées automatiquement sans autorisation explicite.
          </p>
          {contradictions.length > 0 && (
            <div className={`rounded-2xl border p-4 space-y-2 ${extremeDark ? "border-amber-500/25 bg-amber-950/10" : "border-amber-400/30 bg-amber-500/10"}`}>
              <button
                type="button"
                onClick={() => setShowContradictions((v) => !v)}
                className="inline-flex items-center gap-2 min-h-[40px] text-xs font-medium text-amber-100 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{contradictions.length} contradiction(s) potentielle(s) détectée(s) — à confirmer manuellement</span>
                <span className="text-amber-200/70">{showContradictions ? "Masquer" : "Afficher"}</span>
              </button>
              {showContradictions && (
                <ul className="space-y-2">
                  {contradictions.map((c) => (
                    <li key={c.id} className={`rounded-xl border p-3 text-xs space-y-1 ${extremeDark ? "border-white/[0.06] bg-black/30 text-slate-300" : "border-amber-400/20 bg-white/40 text-slate-700"}`}>
                      <p className="font-medium text-amber-100">{c.reason}</p>
                      <p>« {c.first.fact} »</p>
                      <p>« {c.second.fact} »</p>
                      <p className="opacity-70">Signalement heuristique à confiance faible : vérifiez ces souvenirs et corrigez-les manuellement si nécessaire. Aucune suppression automatique n'est effectuée.</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className={`${cardCls} flex flex-wrap items-center gap-2`}>
            <button
              type="button"
              onClick={() => onSetMemoryEnabled?.(!memoryEnabled)}
              className={`inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border text-xs font-medium cursor-pointer ${
                memoryEnabled ? "border-cyan-400/35 bg-cyan-500/12 text-cyan-100" : "border-amber-400/35 bg-amber-500/10 text-amber-100"
              }`}
            >
              <ShieldOff className="w-4 h-4" />
              {memoryEnabled ? "Mémoire activée" : "Mémoire désactivée"}
            </button>
            <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border border-white/[0.08] text-xs font-medium text-slate-200 hover:bg-white/[0.05] cursor-pointer">
              <Download className="w-4 h-4" />Exporter
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-xl border border-white/[0.08] text-xs font-medium text-slate-200 hover:bg-white/[0.05] cursor-pointer">
              <Upload className="w-4 h-4" />Importer / Restaurer
            </button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { void handleImportFile(e.target.files?.[0] || null); e.target.value = ""; }} />
            {importMsg && <span className="text-xs text-cyan-200">{importMsg}</span>}
            {!memoryEnabled && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                <AlertTriangle className="w-3.5 h-3.5" />Aucun souvenir n'est envoyé à Gemini tant que la mémoire est désactivée.
              </span>
            )}
          </div>
        </header>

        <form onSubmit={handleAdd} className={`${cardCls} space-y-3`}>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="Ajouter un souvenir durable (préférence, objectif, décision, habitude...)"
              aria-label="Nouveau souvenir permanent"
              className={`flex-1 h-11 px-3.5 rounded-xl border text-sm focus:outline-none ${
                extremeDark ? "bg-black border-white/[0.07] focus:border-cyan-500/40 text-slate-200 placeholder:text-slate-600" : "bg-[#050A14]/85 border-cyan-400/20 focus:border-cyan-400/50 text-slate-100 placeholder:text-slate-500"
              }`}
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
              aria-label="Catégorie du souvenir"
              className={`h-11 px-3 rounded-xl border text-sm focus:outline-none ${extremeDark ? "bg-black border-white/[0.07] text-slate-300" : "bg-[#050A14]/90 border-cyan-400/20 text-slate-200"}`}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <button type="submit" disabled={!newFact.trim()} className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer ${extremeDark ? "bg-cyan-950/35 border-cyan-500/30 text-cyan-200" : "bg-cyan-400 hover:bg-cyan-300 border-cyan-300 text-slate-950"}`}>
              <Plus className="w-4 h-4" /><span>Mémoriser</span>
            </button>
          </div>
        </form>

        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer vos souvenirs..."
              aria-label="Rechercher dans la mémoire permanente"
              className={`w-full h-11 pl-10 pr-4 rounded-xl border text-sm focus:outline-none ${extremeDark ? "bg-black border-white/[0.06] text-slate-200 placeholder:text-slate-600" : "bg-[#060C18]/80 border-cyan-400/15 focus:border-cyan-400/45 text-slate-100 placeholder:text-slate-500"}`}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setFilterCat("all")} className={`min-h-[40px] px-3 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer ${filterCat === "all" ? (extremeDark ? "bg-cyan-950/40 border-cyan-500/30 text-cyan-200" : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100") : (extremeDark ? "border-white/[0.06] text-slate-500 hover:text-slate-300" : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-slate-200")}`}>
              Toutes ({memories.length})
            </button>
            {CATEGORIES.map((c) => (
              <button key={c.id} type="button" onClick={() => setFilterCat(c.id)} className={`min-h-[40px] px-3 rounded-lg border text-xs font-medium whitespace-nowrap cursor-pointer ${filterCat === c.id ? (extremeDark ? "bg-cyan-950/40 border-cyan-500/30 text-cyan-200" : "bg-cyan-500/18 border-cyan-400/35 text-cyan-100") : (extremeDark ? "border-white/[0.06] text-slate-500 hover:text-slate-300" : "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-slate-200")}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className={`rounded-2xl border p-8 text-center text-sm ${extremeDark ? "bg-black border-white/[0.05] text-slate-600" : "jarvis-glass text-slate-400"}`}>
            Aucun souvenir ne correspond à ce filtre.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((item) => {
              const isEditing = editingId === item.id;
              const cat = (item.category ?? "autre") as string;
              return (
                <li key={item.id} className={`rounded-2xl border p-4 transition-colors ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass"}`}>
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editFact}
                        onChange={(e) => setEditFact(e.target.value)}
                        aria-label="Modifier le souvenir"
                        className={`w-full h-11 px-3.5 rounded-xl border text-sm focus:outline-none ${extremeDark ? "bg-black border-cyan-500/40 text-slate-200" : "bg-[#050A14] border-cyan-400/40 text-slate-100"}`}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as MemoryCategory)} aria-label="Modifier la catégorie" className={`h-11 px-3 rounded-xl border text-sm ${extremeDark ? "bg-black border-white/[0.07] text-slate-300" : "bg-[#050A14] border-cyan-400/20 text-slate-200"}`}>
                          {CATEGORIES.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
                        </select>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setEditingId(null)} className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border border-white/[0.08] text-xs font-medium text-slate-300 hover:bg-white/[0.05] cursor-pointer"><X className="w-4 h-4" /><span>Annuler</span></button>
                          <button type="button" onClick={() => saveEdit(item.id)} className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border border-cyan-400/40 bg-cyan-500/20 text-xs font-medium text-cyan-100 hover:bg-cyan-500/30 cursor-pointer"><Check className="w-4 h-4" /><span>Enregistrer</span></button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <p className={`text-[15px] leading-relaxed break-words ${item.disabled ? "text-slate-500 line-through" : extremeDark ? "text-slate-200" : "text-slate-100"}`}>{item.fact}</p>
                        <p className={`text-xs flex items-center flex-wrap gap-2 ${extremeDark ? "text-slate-600" : "text-slate-400"}`}>
                          <span className={extremeDark ? "text-cyan-400/75" : "text-cyan-300"}>{CATEGORY_LABELS[cat] || cat}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">{formatDate(item.updatedAt ?? item.createdAt)}</span>
                          {item.kind && item.kind !== "fact" && <><span aria-hidden="true">·</span><span className="text-amber-300">{item.kind === "hypothesis" ? "Hypothèse" : "Incertain"}</span></>}
                          {item.sensitive && <><span aria-hidden="true">·</span><span className="text-amber-300">Sensible</span></>}
                          {item.modeId && <><span aria-hidden="true">·</span><span className="text-slate-400">Mode : {item.modeId}</span></>}
                          {item.pinned && <><span aria-hidden="true">·</span><span className="text-cyan-300">Épinglé</span></>}
                          {item.disabled && <><span aria-hidden="true">·</span><span className="text-slate-500">Désactivé</span></>}
                          {item.source && item.source !== "user" && <><span aria-hidden="true">·</span><span className="text-slate-500">Source : {item.source}</span></>}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => onTogglePinMemory(item.id)} aria-label={item.pinned ? "Désépingler" : "Épingler ce souvenir"} className={`inline-flex items-center justify-center w-11 h-11 rounded-xl transition-colors cursor-pointer ${item.pinned ? "text-cyan-300 bg-cyan-500/15" : "text-slate-500 hover:text-cyan-200 hover:bg-white/[0.05]"}`}>
                          <Pin className="w-4 h-4" />
                        </button>
                        {onToggleDisableMemory && (
                          <button type="button" onClick={() => onToggleDisableMemory(item.id)} aria-label={item.disabled ? "Réactiver ce souvenir" : "Désactiver ce souvenir"} className={`inline-flex items-center justify-center w-11 h-11 rounded-xl transition-colors cursor-pointer ${item.disabled ? "text-amber-300 bg-amber-500/10" : "text-slate-500 hover:text-amber-200 hover:bg-white/[0.05]"}`}>
                            <EyeOff className="w-4 h-4" />
                          </button>
                        )}
                        <button type="button" onClick={() => startEdit(item)} aria-label="Modifier ce souvenir" className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:text-cyan-200 hover:bg-white/[0.05] transition-colors cursor-pointer">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => onRemoveMemory(item.id)} aria-label="Supprimer ce souvenir" className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
