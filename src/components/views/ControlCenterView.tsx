import { useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  Bell,
  Bot,
  CalendarDays,
  CheckCircle2,
  Cpu,
  Image as ImageIcon,
  Link2,
  ListChecks,
  PlugZap,
  ShieldAlert,
  UserCircle2,
  Workflow,
  XCircle,
} from "lucide-react";
import type { AppView, ProjectItem } from "../../types/jarvis";
import { fetchAiProviders, type AiProviderInfo } from "../../services/ai/AiProvidersClient";

interface ControlCenterViewProps {
  extremeDark: boolean;
  isOnline: boolean;
  projects: ProjectItem[];
  geminiModel: string | null;
  onSelectView?: (view: AppView) => void;
  activeModeName?: string | null;
  memoryCount?: number;
  memoryEnabled?: boolean;
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "off" }) {
  const cls = tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-slate-400";
  const Icon = tone === "ok" ? CheckCircle2 : tone === "warn" ? ShieldAlert : XCircle;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-300">{label}</span>
      <span className={`inline-flex items-center gap-1.5 ${cls}`}><Icon className="w-4 h-4" />{value}</span>
    </div>
  );
}

export function ControlCenterView({ extremeDark, isOnline, projects, geminiModel, onSelectView, activeModeName, memoryCount, memoryEnabled }: ControlCenterViewProps) {
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  useEffect(() => {
    void fetchAiProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  const gemini = providers.find((p) => p.id === "gemini");
  const activeProjects = useMemo(() => projects.filter((p) => p.status !== "archived"), [projects]);
  const openTasks = useMemo(() => {
    let n = 0;
    const count = (tasks: any[]) => {
      for (const t of tasks || []) {
        if (t.status !== "done") n++;
        if (t.subtasks?.length) count(t.subtasks);
      }
    };
    for (const p of activeProjects) count(p.tasks || []);
    return n;
  }, [activeProjects]);

  const card = `rounded-2xl border p-4 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>Centre de contrôle</h1>
          <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Gestion quotidienne de l&apos;environnement numérique. Les actions sensibles demandent confirmation ; les capacités non disponibles sont indiquées clairement.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><Cpu className="w-4 h-4" />Cerveau central (Phase 1)</div>
            <div className="text-sm text-slate-300 space-y-1.5">
              <p>Contexte unifié actif : conversations, mémoire, projets et mode partagés entre modules (source unique).</p>
              <Stat label="Gemini (cerveau principal)" value={gemini?.status === "available" ? "Opérationnel" : gemini?.status === "not_configured" ? "Non configuré" : "Indisponible"} tone={gemini?.status === "available" ? "ok" : "off"} />
              <Stat label="Mode actif" value={activeModeName || "Standard"} tone="ok" />
              <Stat label="Mémoire" value={memoryEnabled ? `${memoryCount ?? 0} élément(s) en contexte` : "Désactivée"} tone={memoryEnabled ? "ok" : "off"} />
              <Stat label="Sélection fournisseurs" value="Auto/manuel centralisé (fallback Gemini)" tone="ok" />
            </div>
            <p className="text-xs text-slate-500">Les actions sensibles nécessitent confirmation explicite. Continuité inter-appareils : non opérationnelle sans synchronisation serveur/compte configurée.</p>
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><ListChecks className="w-4 h-4" />Tâches et objectifs</div>
            <div className="text-sm text-slate-300 space-y-1">
              <p>{activeProjects.length} projet(s) actif(s)/en cours</p>
              <p>{openTasks} tâche(s) ouverte(s) (tous projets)</p>
            </div>
            <p className="text-xs text-slate-500">Source : projets existants (local). Utilisez l’espace Projets pour créer/modifier objectifs, tâches, blocages et prochaines actions.</p>
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><Bell className="w-4 h-4" />Rappels</div>
            <p className="text-sm text-slate-400">Aucun rappel planifié (moteur de rappels dédié non encore opérationnel).</p>
            <p className="text-xs text-slate-500">Les demandes naturelles (« Rappelle-moi… ») pourront créer des rappels lorsque la fonction sera activée, avec confirmation si nécessaire.</p>
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><CalendarDays className="w-4 h-4" />Calendrier</div>
            <Stat label="Google Calendar" value="Non connecté" tone="off" />
            <p className="text-xs text-slate-500">Connexion OAuth Google requise (non configurée). Consultation/création/modification/suppression d’événements après connexion et confirmation pour actions sensibles.</p>
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><AppWindow className="w-4 h-4" />Applications installées (Windows)</div>
            <Stat label="Contrôle des applications" value="Indisponible dans ce contexte" tone="off" />
            <p className="text-xs text-slate-500 leading-relaxed">
              La détection/ouverture/fermeture/désinstallation d’applications Windows nécessite un accès local à l’hôte (agent/serveur local avec permissions). Aucune commande dangereuse ne sera exécutée ; désinstallation uniquement après confirmation explicite.
            </p>
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><UserCircle2 className="w-4 h-4" />Comptes Google connectés</div>
            <Stat label="Connexion OAuth 2.0" value="Non configurée" tone="off" />
            <div className="text-xs text-slate-400 space-y-1">
              <p>Services prévus : Gmail, Drive, Calendar, Contacts (intégration progressive).</p>
              <p>Multi-comptes, compte actif, autorisations et déconnexion (sans suppression du compte Google) : disponibles après configuration OAuth serveur.</p>
              <p>Aucun mot de passe stocké. Jetons prévus côté serveur (chiffrés), jamais exposés au navigateur.</p>
            </div>
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><Workflow className="w-4 h-4" />Automatisations</div>
            <Stat label="Moteur d’automatisation" value="Non opérationnel" tone="off" />
            <p className="text-xs text-slate-500">Les automatisations (règles/planifications/actions) seront listées ici lorsqu’implémentées. Aucune action externe sans autorisation explicite.</p>
          </section>

          <section className={`${card} space-y-3 md:col-span-2 xl:col-span-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><PlugZap className="w-4 h-4" />État des services et connexions</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className={`rounded-xl border p-3 space-y-2 ${extremeDark ? "border-white/[0.06]" : "border-white/[0.08]"}`}>
                <div className="flex items-center gap-2 text-slate-200"><Cpu className="w-4 h-4 text-cyan-300" />Cerveau & voix</div>
                <Stat label="Réseau" value={isOnline ? "En ligne" : "Hors ligne"} tone={isOnline ? "ok" : "warn"} />
                <Stat label="Gemini" value={gemini?.status === "available" ? `Disponible${geminiModel ? ` (${geminiModel})` : ""}` : gemini?.status === "not_configured" ? "Non configuré" : "Indisponible"} tone={gemini?.status === "available" ? "ok" : "off"} />
                <Stat label="Voix" value="fr-FR-HenriNeural (préservée)" tone="ok" />
              </div>
              <div className={`rounded-xl border p-3 space-y-2 ${extremeDark ? "border-white/[0.06]" : "border-white/[0.08]"}`}>
                <div className="flex items-center gap-2 text-slate-200"><Link2 className="w-4 h-4 text-cyan-300" />Intégrations</div>
                <Stat label="Google (Gmail/Drive/Calendar/Contacts)" value="Non connecté" tone="off" />
                <Stat label="Social Hub" value="Selon configuration existante" tone="warn" />
                <Stat label="Apps Windows" value="Indisponible ici" tone="off" />
              </div>
              <div className={`rounded-xl border p-3 space-y-2 ${extremeDark ? "border-white/[0.06]" : "border-white/[0.08]"}`}>
                <div className="flex items-center gap-2 text-slate-200"><ShieldAlert className="w-4 h-4 text-cyan-300" />Sécurité</div>
                <p className="text-xs text-slate-400 leading-relaxed">Confirmations requises avant envoi d’email, suppression, modification importante ou action sensible. Aucun mot de passe Google demandé/stocké. Aucune commande dangereuse sans confirmation explicite.</p>
              </div>
            </div>
          </section>
        </div>

        <section className={`${card} space-y-3`}>
          <h2 className="text-sm font-medium text-cyan-100">Modules IA</h2>
          <p className="text-xs text-slate-400">Accès aux rubriques multi-IA et Studio Images (capacités réelles uniquement, 0 €).</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectView?.("aiHub")}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-sm text-cyan-100 cursor-pointer hover:bg-cyan-500/15"
            >
              <Bot className="w-4 h-4" /> Intelligences artificielles
            </button>
            <button
              type="button"
              onClick={() => onSelectView?.("imageStudio")}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-sm text-cyan-100 cursor-pointer hover:bg-cyan-500/15"
            >
              <ImageIcon className="w-4 h-4" /> Studio Images
            </button>
          </div>
        </section>

        <section className={`${card} space-y-2`}>
          <h2 className="text-sm font-medium text-cyan-100">Demandes naturelles (exemples)</h2>
          <p className="text-xs text-slate-400">JARVIS pourra interpréter ces demandes lorsque les intégrations correspondantes seront opérationnelles et autorisées :</p>
          <ul className="text-sm text-slate-300 list-disc pl-5 space-y-1">
            <li>« Ouvre Chrome. » — <span className="text-slate-500">nécessite contrôle apps local disponible</span></li>
            <li>« Vérifie mes nouveaux emails. » — <span className="text-slate-500">nécessite Gmail connecté (OAuth)</span></li>
            <li>« Ajoute un rendez-vous demain à 15 heures. » — <span className="text-slate-500">nécessite Calendar connecté + confirmation</span></li>
            <li>« Quels sont mes prochains rendez-vous ? » — <span className="text-slate-500">nécessite Calendar connecté</span></li>
            <li>« Rappelle-moi de travailler sur mon projet demain. » — <span className="text-slate-500">nécessite moteur de rappels opérationnel</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
