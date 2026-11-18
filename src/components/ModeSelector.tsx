import { useState } from "react";
import type { ComponentType } from "react";
import {
  Brain,
  ChevronDown,
  ChefHat,
  FlaskConical,
  GraduationCap,
  Heart,
  Landmark,
  Laugh,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import type { CustomMode } from "../types/jarvis";
import { BUILTIN_MODES } from "../services/modes/ModeRepository";

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Brain,
  GraduationCap,
  Sparkles,
  Trophy,
  ChefHat,
  Heart,
  Laugh,
  Landmark,
  FlaskConical,
};

interface ModeSelectorProps {
  extremeDark: boolean;
  activeModeId: string;
  customModes: CustomMode[];
  onSelectMode: (id: string) => void;
  onSaveCustomMode: (draft: {
    name: string;
    description: string;
    personality: string;
    instructions: string;
    voiceBehavior: { rate: number; pitch: number; expressiveness: number };
    active?: boolean;
    id?: string;
  }) => Promise<void> | void;
  onDeleteCustomMode: (id: string) => Promise<void> | void;
  onToggleCustomMode: (id: string, active: boolean) => Promise<void> | void;
}

export function ModeSelector({
  extremeDark,
  activeModeId,
  customModes,
  onSelectMode,
  onSaveCustomMode,
  onDeleteCustomMode,
  onToggleCustomMode,
}: ModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    personality: "",
    instructions: "",
    rate: 1,
    pitch: 1,
    expressiveness: 0.6,
  });

  const activeBuiltin = BUILTIN_MODES.find((m) => m.id === activeModeId);
  const activeCustom = customModes.find((m) => m.id === activeModeId);
  const activeName = activeBuiltin?.name ?? activeCustom?.name ?? "JARVIS CLASSIQUE";
  const ActiveIcon = activeBuiltin ? ICON_MAP[activeBuiltin.icon] ?? Brain : Sparkles;

  const beginEdit = (mode: CustomMode) => {
    setEditingId(mode.id);
    setDraft({
      name: mode.name,
      description: mode.description,
      personality: mode.personality,
      instructions: mode.instructions,
      rate: mode.voiceBehavior.rate,
      pitch: mode.voiceBehavior.pitch,
      expressiveness: mode.voiceBehavior.expressiveness,
    });
    setShowCreate(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowCreate(false);
    setDraft({
      name: "",
      description: "",
      personality: "",
      instructions: "",
      rate: 1,
      pitch: 1,
      expressiveness: 0.6,
    });
  };

  const handleCreate = async () => {
    if (!draft.name.trim()) return;
    await onSaveCustomMode({
      ...(editingId ? { id: editingId } : {}),
      name: draft.name,
      description: draft.description,
      personality: draft.personality,
      instructions: draft.instructions,
      voiceBehavior: {
        rate: draft.rate,
        pitch: draft.pitch,
        expressiveness: draft.expressiveness,
      },
      active: editingId
        ? customModes.find((m) => m.id === editingId)?.active ?? true
        : true,
    });
    setDraft({
      name: "",
      description: "",
      personality: "",
      instructions: "",
      rate: 1,
      pitch: 1,
      expressiveness: 0.6,
    });
    setEditingId(null);
    setShowCreate(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full min-h-[44px] px-3.5 rounded-xl border text-sm font-medium flex items-center gap-2.5 transition-colors cursor-pointer ${
          extremeDark
            ? "bg-black/60 border-white/[0.08] text-slate-200 hover:border-cyan-500/30"
            : "jarvis-glass border-cyan-400/20 text-slate-100 hover:border-cyan-400/35"
        }`}
        aria-expanded={open}
        aria-label="Sélecteur de modes"
      >
        <ActiveIcon className="w-4 h-4 text-cyan-300 shrink-0" />
        <span className="truncate flex-1 text-left">{activeName}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-40 mt-2 w-full rounded-2xl border p-3 space-y-3 max-h-[70vh] overflow-y-auto ${
            extremeDark
              ? "bg-black/95 border-white/[0.08]"
              : "bg-slate-950/95 border-cyan-400/20 backdrop-blur-md"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono-tabular text-slate-400 uppercase tracking-wider">
              Modes
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BUILTIN_MODES.map((mode) => {
              const Icon = ICON_MAP[mode.icon] ?? Brain;
              const isActive = mode.id === activeModeId;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    onSelectMode(mode.id);
                    setOpen(false);
                  }}
                  className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-left flex items-center gap-2 transition-colors cursor-pointer ${
                    isActive
                      ? extremeDark
                        ? "bg-cyan-950/50 border-cyan-500/40 text-cyan-100"
                        : "bg-cyan-500/15 border-cyan-400/35 text-cyan-100"
                      : extremeDark
                      ? "border-white/[0.08] text-slate-300 hover:border-white/[0.16]"
                      : "border-white/[0.08] text-slate-300 hover:border-cyan-400/25"
                  }`}
                  title={mode.description}
                >
                  <Icon className="w-4 h-4 text-cyan-300 shrink-0" />
                  <span className="text-xs font-medium truncate">{mode.name}</span>
                </button>
              );
            })}
          </div>

          {customModes.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-mono-tabular text-slate-400 uppercase tracking-wider">
                Modes personnalisés
              </span>
              <div className="space-y-1.5">
                {customModes.map((mode) => {
                  const isActive = mode.id === activeModeId;
                  return (
                    <div
                      key={mode.id}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                        isActive
                          ? extremeDark
                            ? "bg-cyan-950/50 border-cyan-500/40"
                            : "bg-cyan-500/15 border-cyan-400/35"
                          : extremeDark
                          ? "border-white/[0.08]"
                          : "border-white/[0.08]"
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-cyan-300 shrink-0" />
                      <button
                        type="button"
                        onClick={() => {
                          onSelectMode(mode.id);
                          setOpen(false);
                        }}
                        className="flex-1 text-left text-xs font-medium text-slate-200 truncate cursor-pointer"
                        title={mode.description}
                      >
                        {mode.name}
                        {!mode.active && (
                          <span className="ml-1 text-[10px] text-slate-500">(désactivé)</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => beginEdit(mode)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-cyan-300 cursor-pointer"
                        aria-label={`Modifier ${mode.name}`}
                        title="Modifier"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleCustomMode(mode.id, !mode.active)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-cyan-300 cursor-pointer"
                        aria-label={mode.active ? "Désactiver" : "Activer"}
                        title={mode.active ? "Désactiver" : "Activer"}
                      >
                        <Power className={`w-3.5 h-3.5 ${mode.active ? "text-emerald-400" : "text-slate-500"}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCustomMode(mode.id)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-red-300 cursor-pointer"
                        aria-label="Supprimer"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-1 border-t border-white/[0.06]">
            {!showCreate ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className={`w-full min-h-[40px] px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 cursor-pointer ${
                  extremeDark
                    ? "border-cyan-500/25 text-cyan-300/85 hover:bg-cyan-950/40"
                    : "border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/10"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Créer ou modifier un mode personnalisé
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Nom du mode"
                  className={`w-full min-h-[40px] px-3 rounded-lg border text-sm bg-transparent outline-none ${
                    extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                  }`}
                />
                <input
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Description"
                  className={`w-full min-h-[40px] px-3 rounded-lg border text-sm bg-transparent outline-none ${
                    extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                  }`}
                />
                <textarea
                  value={draft.personality}
                  onChange={(e) => setDraft((d) => ({ ...d, personality: e.target.value }))}
                  placeholder="Personnalité"
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border text-sm bg-transparent outline-none resize-none ${
                    extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                  }`}
                />
                <textarea
                  value={draft.instructions}
                  onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
                  placeholder="Instructions"
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border text-sm bg-transparent outline-none resize-none ${
                    extremeDark ? "border-white/[0.1] text-slate-100" : "border-white/[0.1] text-slate-100"
                  }`}
                />
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[11px] text-slate-400">
                    Débit
                    <input
                      type="range"
                      min={0.7}
                      max={1.2}
                      step={0.05}
                      value={draft.rate}
                      onChange={(e) => setDraft((d) => ({ ...d, rate: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </label>
                  <label className="text-[11px] text-slate-400">
                    Hauteur
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.05}
                      value={draft.pitch}
                      onChange={(e) => setDraft((d) => ({ ...d, pitch: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </label>
                  <label className="text-[11px] text-slate-400">
                    Expressivité
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.1}
                      value={draft.expressiveness}
                      onChange={(e) => setDraft((d) => ({ ...d, expressiveness: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCreate}
                    className={`flex-1 min-h-[40px] rounded-lg text-xs font-medium cursor-pointer ${
                      extremeDark
                        ? "bg-cyan-950/60 text-cyan-200 border border-cyan-500/35"
                        : "bg-cyan-500/20 text-cyan-100 border border-cyan-400/35"
                    }`}
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="min-h-[40px] px-3 rounded-lg text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}