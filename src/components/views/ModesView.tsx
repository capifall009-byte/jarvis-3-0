import { Settings2, Sliders } from "lucide-react";
import { ModeSelector } from "../ModeSelector";
import type { CustomMode, JarvisMode } from "../../types/jarvis";

interface ModesViewProps {
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
  }) => void | Promise<void>;
  onDeleteCustomMode: (id: string) => void | Promise<void>;
  onToggleCustomMode: (id: string, active: boolean) => void | Promise<void>;
  activeMode: JarvisMode | null;
}

export function ModesView({
  extremeDark,
  activeModeId,
  customModes,
  onSelectMode,
  onSaveCustomMode,
  onDeleteCustomMode,
  onToggleCustomMode,
  activeMode,
}: ModesViewProps) {
  const card = `rounded-2xl border p-4 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;
  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>Modes</h1>
          <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Les neuf modes existants et vos modes personnalisés sont conservés. Sélectionnez, activez ou créez un mode adapté.
          </p>
        </header>

        <section className={`${card} space-y-3`}>
          <div className="flex items-center gap-2 text-cyan-100 font-medium"><Sliders className="w-4 h-4" />Sélecteur de mode</div>
          <ModeSelector
            extremeDark={extremeDark}
            activeModeId={activeModeId}
            customModes={customModes}
            onSelectMode={onSelectMode}
            onSaveCustomMode={onSaveCustomMode}
            onDeleteCustomMode={onDeleteCustomMode}
            onToggleCustomMode={onToggleCustomMode}
          />
        </section>

        <section className={`${card} space-y-2`}>
          <div className="flex items-center gap-2 text-cyan-100 font-medium"><Settings2 className="w-4 h-4" />Mode actif</div>
          {activeMode ? (
            <div className="text-sm text-slate-300 space-y-1">
              <p><span className="text-slate-400">Nom :</span> {activeMode.name}</p>
              <p><span className="text-slate-400">Description :</span> {activeMode.description || "—"}</p>
              <p><span className="text-slate-400">Style/ton :</span> {activeMode.tone}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aucun mode actif.</p>
          )}
        </section>
      </div>
    </div>
  );
}
