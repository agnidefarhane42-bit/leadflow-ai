"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Sparkles, Users, Target, Mail,
  Plus, Trash2, Search, CheckCircle2, Circle, Send, AlertCircle, Zap,
  ChevronRight, User, Building2, TrendingUp, Flame, Clock, X,
} from "lucide-react";

interface Campaign {
  id: number;
  name: string;
  status: string;
  targetCriteria: any;
  offerDescription: string | null;
  agentId: number | null;
  createdAt: string;
}

interface Prospect {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  score: number;
  status: string;
  data: any;
  linkedinUrl: string | null;
}

interface OutreachMessage {
  id: number;
  prospectId: number;
  subject: string | null;
  content: string;
  status: string;
  type: string;
}

interface CampaignStats {
  totalProspects: number;
  newProspects: number;
  qualified: number;
  contacted: number;
  replied: number;
  hot: number;
  warm: number;
  cold: number;
  draftMessages: number;
  sentMessages: number;
  bouncedMessages: number;
}

const PIPELINE_STEPS = [
  { key: "find", label: "Lead Finder", description: "Vrais prospects via IA + scraping", icon: Search, credits: 5 },
  { key: "qualify", label: "Qualification", description: "Scoring IA (hot/warm/cold)", icon: Target, credits: 3 },
  { key: "enrich", label: "Email Reveal", description: "Révélation des vrais emails", icon: Mail, credits: 0 },
  { key: "generate", label: "Rédaction", description: "Création des emails personnalisés", icon: Sparkles, credits: 2 },
  { key: "send", label: "Envoi", description: "Envoi via Gmail", icon: Send, credits: 0 },
];

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = parseInt(params.id as string);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Pipeline state
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepResults, setStepResults] = useState<Record<string, any>>({});
  const [pipelineError, setPipelineError] = useState("");

  // UI state
  const [activeTab, setActiveTab] = useState<"prospects" | "emails">("prospects");
  const [showManual, setShowManual] = useState(false);
  const [manualProspect, setManualProspect] = useState({ name: "", email: "", company: "" });
  const [sending, setSending] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const campRes = await fetch(`/api/campaigns/${campaignId}`);
      if (!campRes.ok) {
        if (campRes.status === 404) setNotFound(true);
        setLoading(false);
        return;
      }
      const campData = await campRes.json();
      setCampaign(campData.campaign);
      setProspects(campData.prospects || []);

      const prospectIds = (campData.prospects || []).map((p: Prospect) => p.id);
      let campaignMessages: OutreachMessage[] = [];
      if (prospectIds.length > 0) {
        const msgRes = await fetch(`/api/outreach?campaignId=${campaignId}`);
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          campaignMessages = msgData.messages || [];
        }
      }
      setMessages(campaignMessages);

      const allProspects: Prospect[] = campData.prospects || [];
      const computedStats: CampaignStats = {
        totalProspects: allProspects.length,
        newProspects: allProspects.filter((p) => p.status === "new").length,
        qualified: allProspects.filter((p) => p.status === "qualified").length,
        contacted: allProspects.filter((p) => p.status === "contacted").length,
        replied: allProspects.filter((p) => p.status === "replied").length,
        hot: allProspects.filter((p) => (p.score ?? 0) >= 70).length,
        warm: allProspects.filter((p) => (p.score ?? 0) >= 40 && (p.score ?? 0) < 70).length,
        cold: allProspects.filter((p) => (p.score ?? 0) < 40).length,
        draftMessages: campaignMessages.filter((m) => m.status === "draft").length,
        sentMessages: campaignMessages.filter((m) => m.status === "sent").length,
        bouncedMessages: campaignMessages.filter((m) => m.status === "bounced").length,
      };
      setStats(computedStats);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runStep = async (step: string) => {
    setPipelineError("");
    setCurrentStep(step);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPipelineError(data.error || "Erreur lors de l'exécution");
        setCurrentStep(null);
        return null;
      }
      setStepResults((prev) => ({ ...prev, [step]: data }));
      await fetchData();
      return data;
    } catch {
      setPipelineError("Erreur de connexion");
      setCurrentStep(null);
      return null;
    }
  };

  const runFullPipeline = async () => {
    setRunning(true);
    setPipelineError("");
    setStepResults({});
    const findResult = await runStep("find");
    if (!findResult) { setRunning(false); setCurrentStep(null); return; }
    const qualifyResult = await runStep("qualify");
    if (!qualifyResult) { setRunning(false); setCurrentStep(null); return; }
    const enrichResult = await runStep("enrich");
    if (!enrichResult) { setRunning(false); setCurrentStep(null); return; }
    const genResult = await runStep("generate");
    if (!genResult) { setRunning(false); setCurrentStep(null); return; }
    setRunning(false);
    setCurrentStep(null);
  };

  const sendAll = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "send" }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
      } else {
        setPipelineError(data.error || "Erreur lors de l'envoi");
      }
    } catch {
      setPipelineError("Erreur de connexion");
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async (messageId: number) => {
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const data = await res.json();
      if (data.success) await fetchData();
    } catch {}
  };

  const addManualProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "manual",
          campaignId,
          name: manualProspect.name,
          email: manualProspect.email,
          company: manualProspect.company,
        }),
      });
      setShowManual(false);
      setManualProspect({ name: "", email: "", company: "" });
      fetchData();
    } catch {}
  };

  const deleteProspect = async (id: number) => {
    await fetch(`/api/prospects/${id}`, { method: "DELETE" });
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
          <p className="text-sm text-slate-400">Chargement…</p>
        </div>
      </div>
    );
  }

  if (notFound || !campaign) {
    return (
      <div className="min-h-screen pt-24 text-center">
        <p className="text-slate-500">Campagne introuvable</p>
        <Link href="/campaigns" className="text-brand-600 font-semibold mt-4 inline-block">Retour aux campagnes</Link>
      </div>
    );
  }

  const getStepState = (stepKey: string) => {
    if (currentStep === stepKey && running) return "running";
    if (stepResults[stepKey]) return "done";
    return "pending";
  };

  const scoreColor = (score: number) => {
    if (score >= 70) return "text-emerald-600 bg-emerald-50";
    if (score >= 40) return "text-amber-600 bg-amber-50";
    return "text-slate-400 bg-slate-50";
  };

  const msgStatusBadge = (status: string) => {
    switch (status) {
      case "sent": return "bg-emerald-50 text-emerald-700 ring-emerald-200";
      case "bounced": return "bg-red-50 text-red-700 ring-red-200";
      case "draft": return "bg-slate-50 text-slate-500 ring-slate-200";
      default: return "bg-slate-50 text-slate-500 ring-slate-200";
    }
  };

  const msgStatusLabel = (status: string) => {
    switch (status) {
      case "sent": return "Envoyé";
      case "bounced": return "Échec";
      case "draft": return "Brouillon";
      default: return status;
    }
  };

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Back link */}
        <Link href="/campaigns" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 transition">
          <ArrowLeft className="w-4 h-4" />
          Campagnes
        </Link>

        {/* Campaign header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-8">
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight mb-2">{campaign.name}</h1>
            {campaign.offerDescription && (
              <p className="text-slate-500 text-sm max-w-2xl leading-relaxed">{campaign.offerDescription}</p>
            )}
            {campaign.targetCriteria && Object.keys(campaign.targetCriteria).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(campaign.targetCriteria).map(([key, value]: [string, any]) => (
                  <span key={key} className="px-2.5 py-0.5 rounded-md bg-slate-50 text-slate-500 text-xs border border-slate-100">
                    {key}: <span className="font-medium text-slate-600">{value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pipeline */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Pipeline IA</h2>
            <button
              onClick={runFullPipeline}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-all shadow-sm hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Traitement…
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Lancer le pipeline
                </>
              )}
            </button>
          </div>

          {/* Pipeline steps */}
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2">
            {PIPELINE_STEPS.map((step, idx) => {
              const state = getStepState(step.key);
              const StepIcon = step.icon;
              return (
                <div key={step.key} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  <div
                    className={`flex items-center gap-2.5 px-3 sm:px-4 py-2.5 rounded-xl border transition-all ${
                      state === "running"
                        ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100"
                        : state === "done"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      state === "running" ? "bg-brand-500 text-white" : state === "done" ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                    }`}>
                      {state === "done" ? <CheckCircle2 className="w-4 h-4" /> : state === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <StepIcon className="w-4 h-4" />}
                    </div>
                    <div className="hidden sm:block">
                      <p className={`text-sm font-semibold ${state === "pending" ? "text-slate-400" : "text-slate-700"}`}>{step.label}</p>
                      <p className="text-xs text-slate-400">{step.description}</p>
                    </div>
                    <div className="sm:hidden">
                      <p className={`text-xs font-semibold ${state === "pending" ? "text-slate-400" : "text-slate-700"}`}>{step.label}</p>
                    </div>
                    {step.credits > 0 && (
                      <span className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-md">{step.credits}cr</span>
                    )}
                  </div>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Error */}
          {pipelineError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {pipelineError}
            </div>
          )}
        </div>

        {/* Stats grid */}
        {stats && stats.totalProspects > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="rounded-xl bg-white border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Prospects</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalProspects}</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Flame className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Hot leads</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{stats.hot}</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Mail className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Brouillons</span>
              </div>
              <p className="text-2xl font-bold">{stats.draftMessages}</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Send className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Envoyés</span>
              </div>
              <p className="text-2xl font-bold text-brand-600">{stats.sentMessages}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-100">
          <button
            onClick={() => setActiveTab("prospects")}
            className={`px-4 py-2.5 text-sm font-semibold transition relative ${
              activeTab === "prospects" ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Users className="w-4 h-4" />
              Prospects
              {stats && stats.totalProspects > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${activeTab === "prospects" ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                  {stats.totalProspects}
                </span>
              )}
            </span>
            {activeTab === "prospects" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab("emails")}
            className={`px-4 py-2.5 text-sm font-semibold transition relative ${
              activeTab === "emails" ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Emails
              {stats && stats.draftMessages + stats.sentMessages > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${activeTab === "emails" ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                  {stats.draftMessages + stats.sentMessages}
                </span>
              )}
            </span>
            {activeTab === "emails" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />}
          </button>
        </div>

        {/* Prospects tab */}
        {activeTab === "prospects" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">
                {prospects.length} prospect{prospects.length > 1 ? "s" : ""} trouvé{prospects.length > 1 ? "s" : ""}
              </p>
              <button
                onClick={() => setShowManual(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition"
              >
                <Plus className="w-4 h-4" />
                Ajouter manuellement
              </button>
            </div>

            {prospects.length === 0 ? (
              <div className="text-center py-16 rounded-2xl bg-white border border-dashed border-slate-200">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Aucun prospect pour le moment</p>
                <p className="text-slate-400 text-xs mt-1">Lancez le pipeline ou ajoutez un prospect manuellement</p>
              </div>
            ) : (
              <div className="space-y-2">
                {prospects.map((p) => {
                  const d = p.data as any;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition group"
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-semibold text-sm flex-shrink-0">
                        {p.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-slate-900 truncate">{p.name}</p>
                          {d?.role && (
                            <span className="text-xs text-slate-400 hidden sm:inline">· {d.role}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {p.company && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {p.company}
                            </span>
                          )}
                          {p.email && (
                            <span className="inline-flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{p.email}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Score */}
                      {p.score > 0 && (
                        <div className={`px-2 py-1 rounded-lg text-xs font-bold ${scoreColor(p.score)} flex-shrink-0 hidden sm:block`}>
                          {p.score}
                        </div>
                      )}

                      {/* Status */}
                      <span className={`text-xs px-2 py-1 rounded-md font-medium flex-shrink-0 ${
                        p.status === "qualified" ? "bg-emerald-50 text-emerald-600" :
                        p.status === "contacted" ? "bg-brand-50 text-brand-600" :
                        p.status === "replied" ? "bg-purple-50 text-purple-600" :
                        "bg-slate-50 text-slate-400"
                      }`}>
                        {p.status === "new" ? "Nouveau" : p.status === "qualified" ? "Qualifié" : p.status === "contacted" ? "Contacté" : p.status === "replied" ? "Répondu" : p.status}
                      </span>

                      {/* Delete */}
                      <button
                        onClick={() => deleteProspect(p.id)}
                        className="text-slate-200 hover:text-red-500 transition opacity-0 group-hover:opacity-100 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Emails tab */}
        {activeTab === "emails" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">
                {messages.length} email{messages.length > 1 ? "s" : ""}
                {stats && stats.draftMessages > 0 && ` · ${stats.draftMessages} en brouillon`}
                {stats && stats.sentMessages > 0 && ` · ${stats.sentMessages} envoyé${stats.sentMessages > 1 ? "s" : ""}`}
              </p>
              {stats && stats.draftMessages > 0 && (
                <button
                  onClick={sendAll}
                  disabled={sending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Envoi…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Tout envoyer ({stats.draftMessages})
                    </>
                  )}
                </button>
              )}
            </div>

            {messages.length === 0 ? (
              <div className="text-center py-16 rounded-2xl bg-white border border-dashed border-slate-200">
                <Mail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Aucun email généré</p>
                <p className="text-slate-400 text-xs mt-1">Lancez le pipeline pour générer des emails personnalisés</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const prospect = prospects.find((p) => p.id === msg.prospectId);
                  const isExpanded = expandedEmail === msg.id;
                  return (
                    <div key={msg.id} className="rounded-xl bg-white border border-slate-100 overflow-hidden">
                      {/* Email header */}
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50/50 transition"
                        onClick={() => setExpandedEmail(isExpanded ? null : msg.id)}
                      >
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 font-semibold text-sm flex-shrink-0">
                          {prospect?.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm text-slate-900 truncate">{prospect?.name || "Inconnu"}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ring-1 ${msgStatusBadge(msg.status)} flex-shrink-0`}>
                              {msgStatusLabel(msg.status)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 truncate mt-0.5">{msg.subject}</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-slate-300 transition flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                      </div>

                      {/* Email body (expanded) */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-slate-50 pt-3">
                          <p className="text-xs text-slate-400 mb-2">À: {prospect?.email || "Pas d'email"}</p>
                          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-xl p-4">
                            {msg.content}
                          </div>
                          {msg.status === "draft" && prospect?.email && (
                            <button
                              onClick={() => sendMessage(msg.id)}
                              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Envoyer cet email
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Manual prospect modal */}
        {showManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowManual(false)}>
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold">Ajouter un prospect</h2>
                <button onClick={() => setShowManual(false)} className="text-slate-400 hover:text-slate-900 p-1 -m-1 rounded-lg hover:bg-slate-50 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={addManualProspect} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom complet</label>
                  <input
                    type="text"
                    value={manualProspect.name}
                    onChange={(e) => setManualProspect({ ...manualProspect, name: e.target.value })}
                    required
                    placeholder="Ex: Jean Dupont"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={manualProspect.email}
                    onChange={(e) => setManualProspect({ ...manualProspect, email: e.target.value })}
                    placeholder="Ex: jean@entreprise.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Entreprise</label>
                  <input
                    type="text"
                    value={manualProspect.company}
                    onChange={(e) => setManualProspect({ ...manualProspect, company: e.target.value })}
                    placeholder="Ex: Tech Corp"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-all shadow-sm active:scale-[0.98]"
                >
                  Ajouter le prospect
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
