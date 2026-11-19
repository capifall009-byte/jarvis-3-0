import { MonitorSmartphone, Smartphone, Link2, Download, CheckCircle2, AlertTriangle, Globe, ShieldCheck, Wifi, Bell } from "lucide-react";
import { usePWAInstall } from "../../services/offline/usePWAInstall";

interface MobileAccessViewProps {
  extremeDark: boolean;
  isOnline: boolean;
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm py-1.5">
      <span className="text-slate-300">{label}</span>
      <span className={`inline-flex items-center gap-1.5 ${ok === true ? "text-emerald-300" : ok === false ? "text-amber-300" : "text-slate-200"}`}>
        {ok === true ? <CheckCircle2 className="w-4 h-4" /> : ok === false ? <AlertTriangle className="w-4 h-4" /> : null}
        {value}
      </span>
    </div>
  );
}

export function MobileAccessView({ extremeDark, isOnline }: MobileAccessViewProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const card = `rounded-2xl border p-4 sm:p-5 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>
            Accès mobile
          </h1>
          <p className={`text-sm ${extremeDark ? "text-slate-500" : "text-slate-400"}`}>
            Accès cohérent à JARVIS depuis iPhone et Android (PWA). Même interface web, même backend sécurisé et même mémoire selon les données disponibles/configurées. Budget 0 € — aucune intégration payante.
          </p>
        </header>

        <section className={`${card} space-y-3`}>
          <div className="flex items-center gap-2 text-cyan-100 font-medium">
            <MonitorSmartphone className="w-4 h-4" /> État de l&apos;application (cet appareil)
          </div>
          <div className="divide-y divide-white/[0.06]">
            <StatusRow label="Réseau" value={isOnline ? "En ligne" : "Hors ligne"} ok={isOnline} />
            <StatusRow label="Installation PWA" value={isInstalled ? "Installée (mode autonome)" : isInstallable ? "Installable" : "Non installée / non disponible"} ok={isInstalled ? true : isInstallable ? undefined : false} />
            <StatusRow label="Plateforme détectée" value={isIOS ? "iOS/iPadOS (navigateur)" : "Navigateur (Android/desktop/autre)"} />
            <StatusRow label="Interface" value="Responsive (mobile, tablette, desktop)" ok />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-sm text-cyan-100 cursor-pointer hover:bg-cyan-500/15"
              >
                <Download className="w-4 h-4" /> Installer JARVIS
              </button>
            )}
            {isInstalled && (
              <span className="text-sm text-emerald-300 inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> JARVIS est installé sur cet appareil.
              </span>
            )}
            {!isInstalled && !isInstallable && (
              <p className="text-xs text-slate-400">
                {isIOS
                  ? "Sur iPhone/iPad : Safari → Partager → « Sur l’écran d’accueil » pour installer la PWA."
                  : "Sur Chrome/Edge : utilisez l’icône d’installation du navigateur ou le menu « Installer l’application » si disponible."}
              </p>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><Smartphone className="w-4 h-4" /> iPhone : Siri et Raccourcis (préparé)</div>
            <p className="text-sm text-slate-300">Accès via la PWA installée et des raccourcis URL (HTTPS) vers le serveur JARVIS. Les fonctions avancées Siri/App Intents natives nécessitent une future app iOS (Swift).</p>
            <ul className="text-xs text-slate-400 space-y-1 list-disc pl-5">
              <li>Ouvrir une rubrique : <code className="text-cyan-200/90">/?view=home</code>, <code className="text-cyan-200/90">/?view=conversations</code>, <code className="text-cyan-200/90">/?view=controlCenter</code>, <code className="text-cyan-200/90">/?view=imageStudio</code></li>
              <li>Nouvelle conversation : <code className="text-cyan-200/90">/?action=new</code></li>
              <li>Envoyer une demande : <code className="text-cyan-200/90">/?q=Votre+message</code></li>
              <li>Écoute (si prise en charge) : <code className="text-cyan-200/90">/?action=listen</code></li>
            </ul>
            <p className="text-xs text-slate-500">Créez un raccourci Apple « Ouvrir des URL » pointant vers votre instance JARVIS ({origin || "URL du serveur"}). Réponses vocales/commandes dépendent des capacités du navigateur/appareil et des permissions.</p>
          </section>

          <section className={`${card} space-y-3`}>
            <div className="flex items-center gap-2 text-cyan-100 font-medium"><Smartphone className="w-4 h-4" /> Android (préparé)</div>
            <p className="text-sm text-slate-300">Accès via la PWA installée, raccourcis d’écran d’accueil et liens directs. Les intégrations système/vocales natives approfondies nécessitent une future app Android (Kotlin).</p>
            <ul className="text-xs text-slate-400 space-y-1 list-disc pl-5">
              <li>Installer la PWA depuis Chrome pour un accès rapide.</li>
              <li>Utiliser les mêmes URL d’intention que ci-contre (raccourcis/navigateurs compatibles).</li>
              <li>Notifications/réponses vocales : selon permissions et support du navigateur/appareil.</li>
            </ul>
            <p className="text-xs text-slate-500">Aucune fonctionnalité Google Assistant/Gemini système n’est supposée disponible sans intégration native compatible réelle.</p>
          </section>
        </div>

        <section className={`${card} space-y-3`}>
          <div className="flex items-center gap-2 text-cyan-100 font-medium"><Link2 className="w-4 h-4" /> Connexion, synchronisation et continuité</div>
          <div className="divide-y divide-white/[0.06]">
            <StatusRow label="API / backend commun" value="Même serveur JARVIS (selon configuration)" ok />
            <StatusRow label="Connexion persistante" value="Selon navigateur/appareil (session locale)" />
            <StatusRow label="Synchronisation multi-appareils (conversations/mémoire/projets)" value="Non opérationnelle — nécessite backend/compte et stockage synchronisé sécurisé configurés (0 €)" ok={false} />
            <StatusRow label="Accès aux rubriques" value="Accueil, Conversations, Studio Images, Centre de contrôle, etc. via interface responsive" ok />
          </div>
          <p className="text-xs text-slate-500">Les données actuelles sont principalement locales à cet appareil/navigateur selon les modules existants. Aucune synchronisation inter-appareils n’est simulée.</p>
        </section>

        <section className={`${card} space-y-3`}>
          <div className="flex items-center gap-2 text-cyan-100 font-medium"><ShieldCheck className="w-4 h-4" /> Sécurité et permissions</div>
          <ul className="text-sm text-slate-300 space-y-1 list-disc pl-5">
            <li>Les actions sensibles demandent confirmation explicite.</li>
            <li>Aucune clé API/token n’est exposé au navigateur ; communications prévues via HTTPS selon déploiement.</li>
            <li>Micro/notifications : soumis aux permissions du navigateur et de l’appareil.</li>
          </ul>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400 pt-1">
            <span className="inline-flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> PWA responsive</span>
            <span className="inline-flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5" /> Gestion d’état réseau (selon support)</span>
            <span className="inline-flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Notifications : selon support/permissions</span>
          </div>
        </section>
      </div>
    </div>
  );
}
