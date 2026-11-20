/**
 * Vue additive « Appareils » — Phase 7 du Central Intelligence Core.
 * Préparation multi-appareils STRICTEMENT LOCALE : identité opaque, checklist,
 * export/import manuel avec aperçu et application explicite. Aucun compte,
 * aucun réseau, aucune synchronisation automatique.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  History,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Square,
  Upload,
  XCircle,
} from "lucide-react";
import type {
  DeviceBundleManifest,
  DeviceImportRecord,
  DevicePreviewResult,
  DeviceStatusView,
} from "../../core/devices/types.ts";
import type { CoreStatus } from "../../core/types.ts";
import { coreClient } from "../../services/core/CoreClient.ts";

interface DevicesViewProps {
  isOnline: boolean;
  extremeDark: boolean;
}

export function DevicesView({ isOnline, extremeDark }: DevicesViewProps) {
  const [status, setStatus] = useState<CoreStatus | null>(null);
  const [devices, setDevices] = useState<DeviceStatusView | null>(null);
  const [storage, setStorage] = useState<CoreStatus["storage"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [exportText, setExportText] = useState<string | null>(null);
  const [exportManifest, setExportManifest] = useState<DeviceBundleManifest | null>(null);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<DevicePreviewResult | null>(null);
  const [lastImport, setLastImport] = useState<DeviceImportRecord | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, payload] = await Promise.all([
        coreClient.getStatus(),
        coreClient.getDevices(),
      ]);
      setStatus(nextStatus);
      setDevices(payload.devices);
      setStorage(payload.storage);
      setLabel((current) => current || payload.devices.label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de contacter le Core.");
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void load();
  }, [isOnline, load]);

  const stop = async () => {
    setBusy(true);
    try {
      await coreClient.stopAll("STOP GLOBAL (vue Appareils)");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "STOP GLOBAL a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const saveLabel = async () => {
    if (busy || !label.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await coreClient.renameDevice(label);
      setNotice("Nom de l'appareil enregistré localement.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Renommage impossible.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      await coreClient.refreshDeviceReadiness();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contrôle impossible.");
    } finally {
      setBusy(false);
    }
  };

  const prepareExport = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const exported = await coreClient.exportDeviceBundle();
      setExportText(exported.text);
      setExportManifest(exported.manifest);
      setNotice(`Export local prêt : ${exported.bytes} octets. Aucun envoi n'a été effectué.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export impossible.");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!exportText) return;
    const blob = new Blob([exportText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jarvis-device-bundle-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const analyse = async () => {
    if (busy || !importText.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setPreview(null);
    setLastImport(null);
    try {
      const result = await coreClient.previewDeviceImport(importText);
      setPreview(result);
      setNotice(`Aperçu prêt : source « ${result.manifest.sourceDevice.label} ». Rien n'a encore été appliqué.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bundle invalide.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (busy || !preview) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const record = await coreClient.applyDeviceImport(preview.stagedId, "user", true);
      setLastImport(record);
      setPreview(null);
      setImportText("");
      setNotice(`Import appliqué : ${record.totals.missions.accepted} mission(s), ${record.totals.skills.accepted} compétence(s), ${record.totals.tools.accepted} outil(s), ${record.totals.tasks.accepted} tâche(s) ajoutée(s) sans écraser l'existant.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  };

  const panel = extremeDark ? "bg-black/60 border-white/[0.07]" : "jarvis-glass border-cyan-400/15";
  const inputClass = `min-h-[38px] w-full rounded-lg border bg-transparent px-2 text-xs ${panel}`;
  const stopped = status?.stopActive === true;

  if (!isOnline) {
    return (
      <div className="flex-1 grid place-items-center p-6">
        <div className={`max-w-md rounded-2xl border p-6 text-center ${panel}`}>
          <AlertTriangle className="w-7 h-7 mx-auto mb-3 text-amber-300" />
          <p className="text-sm text-slate-200">La préparation locale nécessite le serveur Core.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto jarvis-scroll p-4 sm:p-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-display tracking-wider text-cyan-100">Appareils &amp; portabilité</h1>
          <p className="mt-1 text-xs text-slate-400">
            Préparation locale — identité opaque, export/import manuel. Aucun compte, aucun service distant, aucune synchronisation automatique.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs ${panel}`}>
            <RefreshCw className="w-3.5 h-3.5" /> Actualiser
          </button>
          <button type="button" onClick={() => void stop()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 disabled:opacity-50">
            <Square className="w-3.5 h-3.5" /> STOP GLOBAL
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">{notice}</div>}
      {stopped && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-2 text-[11px] text-orange-100">
          <XCircle className="w-4 h-4 shrink-0" /> STOP GLOBAL actif : export, aperçu, import et renommage sont bloqués ; seule la reprise explicite les rétablit.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Appareil", value: devices?.label ?? "—", icon: MonitorSmartphone, text: true },
          { label: "Préparation", value: devices?.readiness ?? "—", icon: ShieldCheck, text: true },
          { label: "Exports locaux", value: devices?.exports ?? 0, icon: Download },
          { label: "Imports", value: devices?.importCount ?? 0, icon: History },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border p-3 ${panel}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
              <item.icon className="w-3.5 h-3.5" /> {item.label}
            </div>
            <p className="mt-2 truncate text-sm font-display text-cyan-100" title={String(item.value)}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className={`rounded-2xl border p-4 ${panel}`}>
          <h2 className="text-sm font-semibold text-slate-100">Identité de cet appareil</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Identifiant opaque : <code className="text-cyan-200/80">{devices?.id ?? "—"}</code> · créé le {devices?.createdAt ? new Date(devices.createdAt).toLocaleDateString("fr-FR") : "—"}. Ce n&apos;est pas un compte et cela n&apos;authentifie aucun service.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Nom de cet appareil" className={`${inputClass} flex-1 min-w-[180px]`} />
            <button type="button" onClick={() => void saveLabel()} disabled={busy || stopped || !label.trim()} className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 text-xs text-cyan-100 disabled:opacity-50">
              Enregistrer
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">Stockage : {storage?.detail ?? "—"} · partagé entre appareils : {storage?.sharedAcrossDevices ? "oui" : "non"}.</p>
        </section>

        <section className={`rounded-2xl border p-4 ${panel}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Checklist de préparation</h2>
            <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300 disabled:opacity-50">Revérifier</button>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {(devices?.checks ?? []).map((check) => (
              <div key={check.id} className="rounded-xl border border-white/[0.06] p-2.5">
                <div className="flex items-center gap-2 text-xs">
                  {check.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                  <span className="text-slate-200">{check.label}</span>
                </div>
                <p className="mt-1 pl-5 text-[10px] text-slate-500">{check.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">« Prêt » signifie uniquement que les prérequis locaux sont réunis. La synchronisation multi-appareils reste désactivée (Phase 10).</p>
        </section>
      </div>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><FileJson className="w-4 h-4" /> Export manuel (aucune transmission)</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void prepareExport()} disabled={busy || stopped} className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-xs text-cyan-100 disabled:opacity-50">
            Préparer un export local
          </button>
          <button type="button" onClick={download} disabled={!exportText} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-200 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Télécharger le fichier
          </button>
        </div>
        {exportManifest && (
          <div className="mt-3 rounded-xl border border-white/[0.06] p-3 text-[11px] text-slate-300">
            <p>Source : {exportManifest.sourceDevice.label} · empreinte : <code className="text-cyan-200/80">{exportManifest.checksum}</code></p>
            <p className="mt-1">Missions : {exportManifest.counts.missions} · compétences : {exportManifest.counts.skills} · outils : {exportManifest.counts.tools} · tâches : {exportManifest.counts.tasks}</p>
            <ul className="mt-2 list-disc pl-5 text-[10px] text-slate-500">
              {exportManifest.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className={`rounded-2xl border p-4 ${panel}`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Upload className="w-4 h-4" /> Import manuel (aperçu puis confirmation)</h2>
        <p className="mt-1 text-[11px] text-slate-500">Collez le contenu d&apos;un export JARVIS. L&apos;aperçu ne modifie rien ; l&apos;application est additive et demande une confirmation explicite.</p>
        <textarea
          value={importText}
          onChange={(e) => { setImportText(e.target.value); setPreview(null); }}
          rows={5}
          placeholder={'{"manifest":{...},"state":{...}}'}
          className={`mt-3 ${inputClass} py-2 font-mono`}
        />
        <button type="button" onClick={() => void analyse()} disabled={busy || stopped || !importText.trim()} className="mt-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-xs text-cyan-100 disabled:opacity-50">
          Analyser le bundle
        </button>
        {preview && (
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
            <p className="text-xs text-amber-100">Aperçu — aucune donnée appliquée pour l&apos;instant.</p>
            <p className="mt-1 text-[11px] text-slate-300">Appareil source : {preview.manifest.sourceDevice.label} · empreinte : <code>{preview.manifest.checksum}</code></p>
            <p className="mt-1 text-[11px] text-slate-300">
              Missions : {preview.manifest.counts.missions} · compétences : {preview.manifest.counts.skills} · outils : {preview.manifest.counts.tools} · tâches : {preview.manifest.counts.tasks}
            </p>
            <ul className="mt-2 list-disc pl-5 text-[10px] text-slate-400">
              {preview.manifest.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
            <button type="button" onClick={() => void apply()} disabled={busy || stopped} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-xs text-emerald-100 disabled:opacity-50">
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmer l&apos;import local
            </button>
          </div>
        )}
        {lastImport && (
          <p className="mt-3 text-[11px] text-emerald-200/80">
            Dernier import : {lastImport.totals.missions.accepted} mission(s), {lastImport.totals.skills.accepted} compétence(s), {lastImport.totals.tools.accepted} outil(s), {lastImport.totals.tasks.accepted} tâche(s) ajoutée(s) · {lastImport.totals.missions.skipped + lastImport.totals.skills.skipped + lastImport.totals.tools.skipped + lastImport.totals.tasks.skipped} conflit(s) ignoré(s).
          </p>
        )}
      </section>

      <div className="rounded-xl border border-cyan-400/15 px-4 py-3 text-[11px] text-slate-400">
        <p className="flex items-center gap-2 text-cyan-100"><ShieldCheck className="w-4 h-4" /> Garanties Phase 7</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Aucun identifiant de compte, aucune clé, aucun secret et aucune donnée de conversation n&apos;est exporté.</li>
          <li>Les approbations de permissions et l&apos;historique d&apos;exécution ne sont jamais importés.</li>
          <li>Les éléments importés restent inactifs jusqu&apos;à vérification locale (compétences en brouillon, outils et tâches désactivés).</li>
          <li>La synchronisation multi-appareils (Phase 10) reste bloquée tant qu&apos;aucun compte, base distante, authentification et transmission de données ne sont explicitement autorisés.</li>
        </ul>
      </div>
    </div>
  );
}
