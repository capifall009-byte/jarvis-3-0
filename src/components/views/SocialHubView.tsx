import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Unplug,
  Video,
} from "lucide-react";
import { listAiVideoHistory } from "../../services/video/VideoGenerationClient";
import {
  analyzeSocialLink,
  analyzeSocialPerformance,
  disconnectSocialAccount,
  fetchSocialAccounts,
  fetchSocialConfig,
  fetchSocialDashboard,
  generateSocialContent,
  listCalendarItems,
  listContentDrafts,
  listPublicationHistory,
  publishSocialContent,
  removeCalendarItem,
  removeContentDraft,
  removePublicationHistory,
  saveCalendarItem,
  saveContentDraft,
  savePublicationHistory,
  startSocialOAuth,
} from "../../services/social/SocialClient";
import type {
  SocialAccountPublic,
  SocialCalendarItem,
  SocialContentDraft,
  SocialDashboard,
  SocialLinkAnalysis,
  SocialOAuthConfigStatus,
  SocialPlatform,
  SocialPublicationHistoryItem,
} from "../../types/jarvis";

type TabId = "overview" | "accounts" | "stats" | "analysis" | "content" | "publish" | "calendar" | "history";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: Share2 },
  { id: "accounts", label: "Comptes", icon: LogIn },
  { id: "stats", label: "Statistiques", icon: BarChart3 },
  { id: "analysis", label: "Analyse IA", icon: Sparkles },
  { id: "content", label: "Création", icon: FileText },
  { id: "publish", label: "Publications", icon: Send },
  { id: "calendar", label: "Calendrier", icon: CalendarDays },
  { id: "history", label: "Historique", icon: History },
];

function uid() {
  return `soc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fmtDate(ts?: number) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("fr-FR"); } catch { return "—"; }
}

function Metric({ label, value, reason }: { label: string; value: number | null; reason?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-cyan-100 font-mono-tabular">{value ?? "—"}</p>
      {value === null && reason && <p className="text-[10px] text-amber-300/80 mt-1">{reason}</p>}
    </div>
  );
}

export function SocialHubView({ isOnline, extremeDark }: { isOnline: boolean; extremeDark: boolean }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [config, setConfig] = useState<{ tiktok: SocialOAuthConfigStatus; instagram: SocialOAuthConfigStatus } | null>(null);
  const [accounts, setAccounts] = useState<SocialAccountPublic[]>([]);
  const [dashboards, setDashboards] = useState<Record<string, SocialDashboard | null>>({ tiktok: null, instagram: null });
  const [analysisText, setAnalysisText] = useState<string>("");
  const [analysisQuestion, setAnalysisQuestion] = useState("");

  const [contentTopic, setContentTopic] = useState("");
  const [contentPlatform, setContentPlatform] = useState<"tiktok" | "instagram" | "both">("both");
  const [contentTone, setContentTone] = useState("engageant");
  const [generatedIdeas, setGeneratedIdeas] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<SocialContentDraft[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{ id: string; title: string } | null>(null);
  const [aiVideos, setAiVideos] = useState<Array<{ id: string; title: string; videoUrl: string; createdAt: number; hasVideo: boolean }>>([]);

  const [calendar, setCalendar] = useState<SocialCalendarItem[]>([]);
  const [pubHistory, setPubHistory] = useState<SocialPublicationHistoryItem[]>([]);

  const [linkUrl, setLinkUrl] = useState("");
  const [linkResult, setLinkResult] = useState<SocialLinkAnalysis | null>(null);

  const [pubPlatform, setPubPlatform] = useState<SocialPlatform>("tiktok");
  const [pubDescription, setPubDescription] = useState("");
  const [pubHashtags, setPubHashtags] = useState("");
  const [pubVideoRef, setPubVideoRef] = useState("");
  const [pubConfirm, setPubConfirm] = useState(false);
  const [pubResult, setPubResult] = useState<any>(null);

  const cardCls = `rounded-2xl border p-4 ${extremeDark ? "bg-black border-white/[0.06]" : "jarvis-glass border-cyan-400/15"}`;
  const btnCls = `inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 ${extremeDark ? "border-white/[0.08] bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]" : "border-cyan-400/20 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"}`;
  const inputCls = `w-full h-10 px-3 rounded-xl border text-sm focus:outline-none ${extremeDark ? "bg-black border-white/[0.08] text-slate-200" : "bg-[#050A14]/80 border-cyan-400/15 text-slate-100"}`;

  const refreshAccounts = useCallback(async () => {
    try {
      const [cfg, acc] = await Promise.all([fetchSocialConfig(), fetchSocialAccounts()]);
      setConfig(cfg);
      setAccounts(acc.accounts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement comptes.");
    }
  }, []);

  const refreshDashboards = useCallback(async () => {
    setLoading(true);
    try {
      const [tk, ig] = await Promise.all([fetchSocialDashboard("tiktok"), fetchSocialDashboard("instagram")]);
      setDashboards({ tiktok: tk, instagram: ig });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur statistiques.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshLocal = useCallback(async () => {
    setDrafts(await listContentDrafts());
    setPubHistory(await listPublicationHistory());
    setCalendar(listCalendarItems());
    try { setAiVideos(await listAiVideoHistory()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void refreshAccounts();
    void refreshLocal();
    // Callback OAuth ?connected=platform
    try {
      const p = new URLSearchParams(window.location.search);
      const c = p.get("connected");
      if (c === "tiktok" || c === "instagram") {
        setNotice(`Retour OAuth ${c} : vérification du statut du compte...`);
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch { /* ignore */ }
  }, [refreshAccounts, refreshLocal]);

  const handleConnect = async (platform: SocialPlatform) => {
    setError(null);
    try {
      const r = await startSocialOAuth(platform);
      // Redirection vers l'autorisation officielle (pas de simulation)
      window.location.href = r.authUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de démarrer OAuth.");
    }
  };

  const handleDisconnect = async (platform: SocialPlatform) => {
    setError(null);
    try {
      await disconnectSocialAccount(platform);
      setNotice(`Compte ${platform} déconnecté.`);
      await refreshAccounts();
      setDashboards((d) => ({ ...d, [platform]: null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur déconnexion.");
    }
  };

  const handleAnalyze = async () => {
    setError(null); setLoading(true);
    try {
      const ds = [dashboards.tiktok, dashboards.instagram].filter(Boolean) as SocialDashboard[];
      const r = await analyzeSocialPerformance({ platform: "all", question: analysisQuestion || undefined, dashboards: ds });
      setAnalysisText(r.analysis || "Aucune analyse générée.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur analyse IA.");
    } finally { setLoading(false); }
  };

  const handleGenerateContent = async () => {
    if (!contentTopic.trim()) { setError("Sujet requis."); return; }
    setError(null); setLoading(true);
    try {
      const r = await generateSocialContent({ platform: contentPlatform, topic: contentTopic, tone: contentTone, sourceVideo: selectedVideo, count: 3 });
      const ideas = Array.isArray(r?.result?.ideas) ? r.result.ideas : [];
      setGeneratedIdeas(ideas);
      if (ideas.length === 0) setNotice("Aucune idée structurée retournée. Vérifiez la configuration Gemini.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur génération contenu.");
    } finally { setLoading(false); }
  };

  const saveIdeaAsDraft = async (idea: any) => {
    const draft: SocialContentDraft = {
      id: uid(),
      platform: contentPlatform,
      idea: String(idea.idea || ""),
      hook: String(idea.hook || ""),
      script: String(idea.script || ""),
      description: String(idea.description || ""),
      hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.map(String) : [],
      subtitles: String(idea.subtitles || ""),
      title: String(idea.title || contentTopic),
      sourceVideoId: selectedVideo?.id,
      sourceVideoTitle: selectedVideo?.title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveContentDraft(draft);
    setDrafts(await listContentDrafts());
    setNotice("Brouillon enregistré.");
  };

  const addCalendarItem = () => {
    const item: SocialCalendarItem = {
      id: uid(), platform: contentPlatform, title: contentTopic || "Nouvelle idée",
      notes: "", status: "idea", createdAt: Date.now(), updatedAt: Date.now(),
    };
    saveCalendarItem(item);
    setCalendar(listCalendarItems());
  };

  const handleLinkAnalyze = async () => {
    if (!linkUrl.trim()) return;
    setError(null); setLoading(true);
    try {
      const r = await analyzeSocialLink(linkUrl.trim());
      setLinkResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur analyse lien.");
    } finally { setLoading(false); }
  };

  const handlePublish = async () => {
    setError(null); setLoading(true); setPubResult(null);
    const req = {
      platform: pubPlatform,
      description: pubDescription,
      hashtags: pubHashtags.split(/[\s,]+/).map(s => s.trim()).filter(Boolean),
      videoSource: (pubVideoRef ? "ai_video_history" : "local_file") as "ai_video_history" | "local_file" | "url",
      videoRef: pubVideoRef || undefined,
      confirmed: pubConfirm,
    };
    const historyItem: SocialPublicationHistoryItem = {
      id: uid(),
      platform: pubPlatform,
      status: pubConfirm ? "pending_confirmation" : "draft",
      request: req,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      const result = await publishSocialContent(req);
      historyItem.result = result;
      historyItem.status = result.published ? "published" : result.scheduled ? "scheduled" : result.ok ? "draft" : "failed";
      setPubResult(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur publication.";
      historyItem.status = "failed";
      historyItem.result = { ok: false, platform: pubPlatform, published: false, scheduled: false, message: msg, limitations: [], performedAt: Date.now() };
      setPubResult(historyItem.result);
      setError(msg);
    } finally {
      await savePublicationHistory(historyItem);
      setPubHistory(await listPublicationHistory());
      setLoading(false);
    }
  };

  const connectedCount = accounts.filter(a => a.status === "connected").length;

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-3 py-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`font-display text-xl sm:text-2xl font-medium ${extremeDark ? "text-slate-200" : "text-cyan-50"}`}>JARVIS Social Hub</h1>
            <p className="text-xs text-slate-400 mt-1">Gestion TikTok & Instagram via API officielles (OAuth). Aucune connexion simulée, aucune publication sans confirmation réelle.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btnCls} onClick={() => { void refreshAccounts(); void refreshLocal(); }} disabled={loading}><RefreshCw className="w-4 h-4" />Actualiser</button>
            <button type="button" className={btnCls} onClick={() => void refreshDashboards()} disabled={loading || !isOnline}><BarChart3 className="w-4 h-4" />Stats</button>
          </div>
        </header>

        {(error || notice) && (
          <div className={`${cardCls} flex items-start gap-2 ${error ? "border-red-400/30" : "border-cyan-400/20"}`}>
            {error ? <AlertTriangle className="w-4 h-4 text-red-300 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-cyan-300 mt-0.5" />}
            <p className={`text-xs ${error ? "text-red-200" : "text-cyan-100"}`}>{error || notice}</p>
            <button type="button" className="ml-auto text-slate-400 hover:text-slate-200 text-xs" onClick={() => { setError(null); setNotice(null); }}>Fermer</button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-xl border text-xs font-medium cursor-pointer ${active ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/[0.08] text-slate-300 hover:bg-white/[0.04]"}`}>
                <Icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className={cardCls}>
              <h2 className="text-sm font-medium text-slate-100 mb-2">État du hub</h2>
              <p className="text-xs text-slate-300">Comptes connectés : <span className="text-cyan-200 font-mono-tabular">{connectedCount}/2</span></p>
              <p className="text-xs text-slate-400 mt-1">Données affichées uniquement si fournies par les API officielles. Dernière mise à jour stats : TikTok {fmtDate(dashboards.tiktok?.fetchedAt)}, Instagram {fmtDate(dashboards.instagram?.fetchedAt)}.</p>
              <div className="mt-3 text-xs text-amber-200/80 space-y-1">
                <p>• Connexion OAuth officielle uniquement (aucun mot de passe demandé/stocké).</p>
                <p>• Publication réelle uniquement après confirmation explicite et réponse API confirmée.</p>
                <p>• Gemini analyse les données disponibles sans inventer de statistiques.</p>
              </div>
            </section>
            <section className={cardCls}>
              <h2 className="text-sm font-medium text-slate-100 mb-2">Analyse de liens (TikTok/Instagram)</h2>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Collez un lien TikTok ou Instagram" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
                <button type="button" className={btnCls} onClick={() => void handleLinkAnalyze()} disabled={loading || !isOnline}><Link2 className="w-4 h-4" />Analyser</button>
              </div>
              {linkResult && (
                <div className="mt-3 text-xs space-y-1">
                  <p className={linkResult.accessible ? "text-cyan-200" : "text-amber-300"}>{linkResult.accessible ? "Informations extraites via endpoint officiel." : "Extraction limitée/non disponible."}</p>
                  {linkResult.extracted?.title && <p className="text-slate-200">Titre: {linkResult.extracted.title}</p>}
                  {linkResult.extracted?.author && <p className="text-slate-300">Auteur: {linkResult.extracted.author}</p>}
                  {linkResult.analysis && (
                    <div className="mt-2 space-y-1 text-slate-300">
                      {linkResult.analysis.style && <p>Style : {linkResult.analysis.style}</p>}
                      {linkResult.analysis.montage && <p>Montage : {linkResult.analysis.montage}</p>}
                      {linkResult.analysis.hooks && <p>Accroches : {linkResult.analysis.hooks}</p>}
                      {linkResult.analysis.trends && <p>Tendances : {linkResult.analysis.trends}</p>}
                      {linkResult.analysis.originalIdeas && linkResult.analysis.originalIdeas.length > 0 && (
                        <p>Idées originales : {linkResult.analysis.originalIdeas.join(" · ")}</p>
                      )}
                    </div>
                  )}
                  {linkResult.limitations?.length > 0 && <ul className="text-amber-200/80 list-disc pl-4">{linkResult.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul>}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "accounts" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(["tiktok", "instagram"] as SocialPlatform[]).map(p => {
              const acc = accounts.find(a => a.platform === p);
              const cfg = config ? config[p] : null;
              return (
                <section key={p} className={cardCls}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-slate-100 capitalize">{p}</h2>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${acc?.status === "connected" ? "border-cyan-400/40 text-cyan-200" : "border-white/[0.1] text-slate-400"}`}>{acc?.status || "inconnu"}</span>
                  </div>
                  {acc?.username && <p className="text-xs text-cyan-200 mt-1">@{acc.username} {acc.displayName ? `· ${acc.displayName}` : ""}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {acc?.status === "connected" ? (
                      <button type="button" className={btnCls} onClick={() => void handleDisconnect(p)}><Unplug className="w-4 h-4" />Déconnecter</button>
                    ) : (
                      <button type="button" className={btnCls} onClick={() => void handleConnect(p)} disabled={!cfg?.configured}><LogIn className="w-4 h-4" />Connecter (OAuth)</button>
                    )}
                  </div>
                  <div className="mt-3 text-xs space-y-1">
                    <p className="text-slate-300 font-medium">Permissions accordées</p>
                    {acc?.permissions?.length ? <ul className="text-slate-400 list-disc pl-4">{acc.permissions.map(pm => <li key={pm.scope}>{pm.scope}</li>)}</ul> : <p className="text-slate-500">Aucune / inconnue (ou non connecté).</p>}
                  </div>
                  {cfg && (
                    <div className="mt-3 text-[11px] text-slate-400 space-y-1">
                      <p>Config serveur: {cfg.configured ? "OK" : `incomplète (manque ${cfg.missingEnv.join(", ") || "variables"})`}</p>
                      {cfg.redirectUri && <p>Redirect URI: <code className="text-slate-300">{cfg.redirectUri}</code></p>}
                      <p className="text-amber-200/80">Éligibilité/conditions :</p>
                      <ul className="list-disc pl-4 text-slate-400">{(acc?.eligibilityNotes || cfg.notes || []).map((n,i)=><li key={i}>{n}</li>)}</ul>
                    </div>
                  )}
                  {acc?.limitations?.length ? <ul className="mt-2 text-[11px] text-amber-200/80 list-disc pl-4">{acc.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul> : null}
                </section>
              );
            })}
          </div>
        )}

        {tab === "stats" && (
          <div className="space-y-4">
            {(["tiktok", "instagram"] as SocialPlatform[]).map(p => {
              const d = dashboards[p];
              return (
                <section key={p} className={cardCls}>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-medium text-slate-100 capitalize">Statistiques {p}</h2>
                    <span className="text-[11px] text-slate-400">Mise à jour: {fmtDate(d?.fetchedAt)}</span>
                  </div>
                  {!d ? <p className="text-xs text-slate-400">Aucune donnée chargée. Cliquez sur “Stats”.</p> : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
                        <Metric label="Abonnés" value={d.followers} reason={d.followers === null ? "Indisponible via API/permissions." : undefined} />
                        <Metric label="Vues" value={d.metrics.views.value} reason={d.metrics.views.unavailableReason} />
                        <Metric label="Likes" value={d.metrics.likes.value} reason={d.metrics.likes.unavailableReason} />
                        <Metric label="Commentaires" value={d.metrics.comments.value} reason={d.metrics.comments.unavailableReason} />
                        <Metric label="Partages" value={d.metrics.shares.value} reason={d.metrics.shares.unavailableReason} />
                      </div>
                      <p className="text-xs text-slate-300 mb-2">Publications récentes ({d.recentPosts.length}) — source: {d.dataSource === "api" ? "API officielle" : "indisponible"}</p>
                      {d.recentPosts.length === 0 ? <p className="text-xs text-slate-500">Aucune publication accessible ou données indisponibles.</p> : (
                        <div className="space-y-2 max-h-64 overflow-auto pr-1">
                          {d.recentPosts.map(post => (
                            <div key={post.id} className="rounded-lg border border-white/[0.07] p-2 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                              <div className="min-w-0">
                                <p className="text-slate-200 truncate">{post.title || post.caption || post.id}</p>
                                <p className="text-slate-500">{fmtDate(post.publishedAt)}</p>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-300 font-mono-tabular">
                                <span>👁 {post.views ?? "—"}</span><span>❤ {post.likes ?? "—"}</span><span>💬 {post.comments ?? "—"}</span><span>↗ {post.shares ?? "—"}</span>
                                {post.permalink && <a className="text-cyan-300 inline-flex items-center gap-1" href={post.permalink} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3" />Lien</a>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {d.evolution.length === 0 && <p className="text-[11px] text-amber-200/80 mt-2">Évolution temporelle indisponible (données historiques non fournies par l'API/permissions actuelles).</p>}
                      {d.limitations.length > 0 && <ul className="mt-2 text-[11px] text-amber-200/80 list-disc pl-4">{d.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul>}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {tab === "analysis" && (
          <section className={cardCls}>
            <h2 className="text-sm font-medium text-slate-100 mb-2">Analyse intelligente (Gemini, données réelles uniquement)</h2>
            <p className="text-xs text-slate-400 mb-2">Gemini s'appuie sur les statistiques chargées ci-dessus et n'invente aucune donnée manquante.</p>
            <textarea className={`${inputCls} h-20 py-2`} placeholder="Question ou objectif d'analyse (optionnel)" value={analysisQuestion} onChange={e => setAnalysisQuestion(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <button type="button" className={btnCls} onClick={() => void handleAnalyze()} disabled={loading || !isOnline}><Sparkles className="w-4 h-4" />Analyser</button>
            </div>
            {analysisText && <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-200 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">{analysisText}</pre>}
          </section>
        )}

        {tab === "content" && (
          <div className="space-y-4">
            <section className={cardCls}>
              <h2 className="text-sm font-medium text-slate-100 mb-2">Générateur de contenu (connecté au Studio Vidéo)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                <select className={inputCls} value={contentPlatform} onChange={e => setContentPlatform(e.target.value as any)}>
                  <option value="both">TikTok + Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                </select>
                <input className={inputCls} placeholder="Ton (ex: engageant, drôle...)" value={contentTone} onChange={e => setContentTone(e.target.value)} />
                <select className={inputCls} value={selectedVideo?.id || ""} onChange={e => {
                  const v = aiVideos.find(x => x.id === e.target.value);
                  setSelectedVideo(v ? { id: v.id, title: v.title } : null);
                }}>
                  <option value="">Vidéo source (Studio Vidéo IA, optionnel)</option>
                  {aiVideos.map(v => <option key={v.id} value={v.id}>{v.title || v.id}</option>)}
                </select>
              </div>
              <textarea className={`${inputCls} h-20 py-2`} placeholder="Sujet / thème de la vidéo..." value={contentTopic} onChange={e => setContentTopic(e.target.value)} />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={btnCls} onClick={() => void handleGenerateContent()} disabled={loading || !isOnline}><Sparkles className="w-4 h-4" />Générer idées/scripts/hashtags</button>
                <button type="button" className={btnCls} onClick={addCalendarItem}><CalendarDays className="w-4 h-4" />Ajouter au calendrier</button>
              </div>
              {generatedIdeas.length > 0 && (
                <div className="mt-3 space-y-2">
                  {generatedIdeas.map((idea, idx) => (
                    <div key={idx} className="rounded-xl border border-white/[0.07] p-3 text-xs space-y-1">
                      <p className="text-cyan-200 font-medium">{idea.title || idea.idea || `Idée ${idx+1}`}</p>
                      {idea.hook && <p><span className="text-slate-400">Accroche:</span> {idea.hook}</p>}
                      {idea.script && <p className="whitespace-pre-wrap"><span className="text-slate-400">Script:</span> {idea.script}</p>}
                      {idea.description && <p><span className="text-slate-400">Description:</span> {idea.description}</p>}
                      {Array.isArray(idea.hashtags) && <p><span className="text-slate-400">Hashtags:</span> {idea.hashtags.join(" ")}</p>}
                      {idea.subtitles && <p><span className="text-slate-400">Sous-titres:</span> {idea.subtitles}</p>}
                      <button type="button" className={`${btnCls} mt-1`} onClick={() => void saveIdeaAsDraft(idea)}>Enregistrer comme brouillon</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className={cardCls}>
              <h2 className="text-sm font-medium text-slate-100 mb-2">Brouillons enregistrés</h2>
              {drafts.length === 0 ? <p className="text-xs text-slate-500">Aucun brouillon.</p> : (
                <div className="space-y-2">
                  {drafts.map(d => (
                    <div key={d.id} className="rounded-lg border border-white/[0.07] p-2 text-xs flex items-start justify-between gap-2">
                      <div><p className="text-slate-200">{d.title}</p><p className="text-slate-500">{d.platform} · {fmtDate(d.updatedAt)}</p></div>
                      <div className="flex gap-2">
                        <button type="button" className={btnCls} onClick={() => { setPubDescription(d.description); setPubHashtags(d.hashtags.join(" ")); setPubVideoRef(d.sourceVideoId || ""); setTab("publish"); }}>Préparer publication</button>
                        <button type="button" className={btnCls} onClick={async () => { await removeContentDraft(d.id); setDrafts(await listContentDrafts()); }}><LogOut className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "publish" && (
          <section className={cardCls}>
            <h2 className="text-sm font-medium text-slate-100 mb-2">Publication (préparation & confirmation explicite)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <select className={inputCls} value={pubPlatform} onChange={e => setPubPlatform(e.target.value as SocialPlatform)}>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
              </select>
              <select className={inputCls} value={pubVideoRef} onChange={e => setPubVideoRef(e.target.value)}>
                <option value="">Importer une vidéo du Studio Vidéo IA (optionnel)</option>
                {aiVideos.filter(v => v.hasVideo).map(v => <option key={v.id} value={v.id}>{v.title || v.id}</option>)}
              </select>
            </div>
            {pubVideoRef && <p className="text-[11px] text-cyan-300 mb-2 flex items-center gap-1"><Video className="w-3.5 h-3.5" />Vidéo sélectionnée: {pubVideoRef} (URL serveur: /api/video/ai/output/{pubVideoRef})</p>}
            <textarea className={`${inputCls} h-24 py-2 mb-2`} placeholder="Description (modifiable)" value={pubDescription} onChange={e => setPubDescription(e.target.value)} />
            <input className={inputCls} placeholder="Hashtags (séparés par espaces)" value={pubHashtags} onChange={e => setPubHashtags(e.target.value)} />
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-100/90 space-y-1">
              <p className="font-medium">Prévisualisation & règles</p>
              <p>Compte: {pubPlatform} · Description: {pubDescription || "(vide)"} · Hashtags: {pubHashtags || "(aucun)"}</p>
              <p>Aucune publication ne sera effectuée sans confirmation explicite. Aucune réussite ne sera annoncée sans confirmation réelle de l'API.</p>
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input type="checkbox" checked={pubConfirm} onChange={e => setPubConfirm(e.target.checked)} />
                <span>Je confirme explicitement vouloir tenter la publication via l'API officielle (si disponible).</span>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className={btnCls} onClick={() => void handlePublish()} disabled={loading}><Send className="w-4 h-4" />{pubConfirm ? "Tenter la publication" : "Préparer (sans publier)"}</button>
            </div>
            {pubResult && (
              <div className="mt-3 text-xs rounded-xl border border-white/[0.07] p-3">
                <p className={pubResult.published ? "text-cyan-200" : "text-amber-200"}>{pubResult.message}</p>
                {pubResult.limitations?.length > 0 && <ul className="mt-1 text-slate-400 list-disc pl-4">{pubResult.limitations.map((l: string,i: number)=><li key={i}>{l}</li>)}</ul>}
              </div>
            )}
          </section>
        )}

        {tab === "calendar" && (
          <section className={cardCls}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-slate-100">Calendrier éditorial (local)</h2>
              <button type="button" className={btnCls} onClick={addCalendarItem}>+ Ajouter</button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Programmation automatique uniquement si l'API officielle le permet (non activée ici sans validation). Ce calendrier est un planning local.</p>
            {calendar.length === 0 ? <p className="text-xs text-slate-500">Aucun élément.</p> : (
              <div className="space-y-2">
                {calendar.map(item => (
                  <div key={item.id} className="rounded-lg border border-white/[0.07] p-2 text-xs flex items-center justify-between gap-2">
                    <div>
                      <p className="text-slate-200">{item.title} <span className="text-slate-500">({item.platform}, {item.status})</span></p>
                      <p className="text-slate-500">{item.scheduledFor ? `Prévu: ${fmtDate(item.scheduledFor)}` : "Non planifié"} · {fmtDate(item.updatedAt)}</p>
                    </div>
                    <button type="button" className={btnCls} onClick={() => { removeCalendarItem(item.id); setCalendar(listCalendarItems()); }}>Supprimer</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className={cardCls}>
            <h2 className="text-sm font-medium text-slate-100 mb-2">Historique des publications / préparations</h2>
            {pubHistory.length === 0 ? <p className="text-xs text-slate-500">Aucun historique.</p> : (
              <div className="space-y-2">
                {pubHistory.map(h => (
                  <div key={h.id} className="rounded-lg border border-white/[0.07] p-2 text-xs flex items-start justify-between gap-2">
                    <div>
                      <p className="text-slate-200">{h.platform} · <span className="text-cyan-300">{h.status}</span></p>
                      <p className="text-slate-500">{fmtDate(h.updatedAt)} — {h.result?.message || "Préparation"}</p>
                      {h.result?.limitations?.length ? <p className="text-amber-200/80">{h.result.limitations[0]}</p> : null}
                    </div>
                    <button type="button" className={btnCls} onClick={async () => { await removePublicationHistory(h.id); setPubHistory(await listPublicationHistory()); }}>Supprimer</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {loading && <div className="flex items-center gap-2 text-xs text-cyan-300"><Loader2 className="w-4 h-4 animate-spin" />Traitement en cours...</div>}
        {!isOnline && <p className="text-[11px] text-amber-300/80">Hors ligne : les appels API/OAuth/Gemini nécessitent une connexion.</p>}
      </div>
    </div>
  );
}
