"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Sparkles, Users, Target, Mail, Linkedin, Coins,
  Plus, Trash2, Search, CheckCircle2, Circle, Send, AlertCircle, Zap, ChevronRight,
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
  { key: "find", label: "Lead Finder", description: "Génération de prospects via IA", icon: Search, credits: 5 },
  { key: "qualify", label: "Qualification", description: "Scoring des prospects (hot/warm/cold)", icon: Target, credits: 3 },
  { key: "generate", label: "Génération emails", description: "Création des messages d'outreach", icon: Mail, credits: 2 },
  { key: "send", label: "Envoi", description: "Envoi des emails via Gmail", icon: Send, credits: 0 },
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

  // Manual prospect modal
  const [showManual, setShowManual] = useState(false);
  const [manualProspect, setManualProspect] = useState({ name: "", email: "", company: "" });

  // Send all state
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Only fetch campaign detail (no GET on /run which only supports POST)
      const campRes = await fetch(`/api/campaigns/${campaignId}`);

      if (!campRes.ok) {
        if (campRes.status === 404) setNotFound(true);
        setLoading(false);
        return;
      }

      const campData = await campRes.json();

      setCampaign(campData.campaign);
      setProspects(campData.prospects || []);

      // Fetch messages for this campaign's prospects
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

      // Compute stats from the data we already have
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
      // If something fails, don't show "not found" — might be a network error
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Run a single step
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

  // Run full pipeline: find → qualify → generate (no auto-send)
  const runFullPipeline = async () => {
    setRunning(true);
    setPipelineError("");
    setStepResults({});

    // Step 1: Find
    const findResult = await runStep("find");
    if (!findResult) { setRunning(false); setCurrentStep(null); return; }

    // Step 2: Qualify
    const qualifyResult = await runStep("qualify");
    if (!qualifyResult) { setRunning(false); setCurrentStep(null); return; }

    // Step 3: Generate
    const genResult = await runStep("generate");
    if (!genResult) { setRunning(false); setCurrentStep(null); return; }

    setRunning(false);
    setCurrentStep(null);
  };

  // Send all draft messages
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

  // Send a single message
  const sendMessage = async (messageId: number) => {
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
      }
    } catch {
      // silent
    }
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
    } catch {
      // silent
    }
  };

  const deleteProspect = async (id: number) => {
    await fetch(`/api/prospects/${id}`, { method: "DELETE" });
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
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

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Back link */}
        <Link href="/campaigns" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 transition">
          <ArrowLeft className="w-4 h-4" />
          Campagnes
        </Link>

        {/* Campaign header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{campaign.name}</h1>
            {campaign.offerDescription && (
              <p className="text-slate-500 mb-3 max-w-2xl">{campaign.offerDescription}</p>
            )}
            {campaign.targetCriteria && Object.keys(campaign.targetCriteria).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(campaign.targetCriteria).map(([key, value]: [string, any]) => (
                  <span key={key} className="px-3 py-1 rounded-lg bg-slate-50 text-slate-600 text-sm">
                    <span className="font-medium text-slate-400">{key}:</span> {String(value)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowManual(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:border-brand-300 transition"
            >
              <Plus className="w-4 h-4" />
              Ajouter prospect
            </button>
          </div>
        </div>

        {/* PIPELINE — The main feature */}
        <div className="glass-card rounded-3xl p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Zap className="w-5 h-5 text-brand-500" />
                Pipeline d'automatisation
              </h2>
              <p className="text-sm text-slate-500 mt-1">Lance le pipeline complet : Lead Finder → Qualification → Emails → Envoi</p>
            </div>
            <button
              onClick={runFullPipeline}
              disabled={running}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Pipeline en cours...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Lancer le pipeline
                </>
              )}
            </button>
          </div>

          {/* Pipeline steps visual */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {PIPELINE_STEPS.map((step, i) => {
              const state = getStepState(step.key);
              const Icon = step.icon;
              const result = stepResults[step.key];

              return (
                <div key={step.key} className="relative">
                  {/* Connector line */}
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="hidden md:block absolute top-6 -right-3 w-6 h-0.5 bg-slate-200">
                      {state === "done" && <div className="w-full h-full bg-emerald-500" />}
                    </div>
                  )}

                  <div
                    className={`rounded-2xl p-5 border transition-all ${
                      state === "running"
                        ? "border-brand-400 bg-brand-50 shadow-lg shadow-brand-500/10"
                        : state === "done"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                        state === "running" ? "bg-brand-500" : state === "done" ? "bg-emerald-500" : "bg-slate-100"
                      }`}>
                        {state === "running" ? (
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        ) : state === "done" ? (
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        ) : (
                          <Icon className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <span className="text-xs font-medium text-slate-400">Étape {i + 1}</span>
                    </div>

                    <h3 className="font-bold text-sm mb-1">{step.label}</h3>
                    <p className="text-xs text-slate-500 mb-2">{step.description}</p>

                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                        <Coins className="w-3 h-3" />
                        {step.credits} crédits
                      </span>
                      {result && (
                        <span className="text-xs font-semibold text-emerald-600">
                          {result.prospectsCreated ? `${result.prospectsCreated} prospects` :
                           result.qualified !== undefined ? `${result.qualified} qualifiés` :
                           result.messagesGenerated ? `${result.messagesGenerated} emails` :
                           result.sent !== undefined ? `${result.sent} envoyés` : "✓"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error */}
          {pipelineError && (
            <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {pipelineError}
            </div>
          )}

          {/* Send all button (appears after generate step) */}
          {(stepResults.generate || (stats?.draftMessages ?? 0) > 0) && !running && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{stats?.draftMessages ?? 0} message(s) en brouillon</p>
                  <p className="text-sm text-slate-500">Vérifiez les messages ci-dessous, puis envoyez-les.</p>
                </div>
                <button
                  onClick={sendAll}
                  disabled={sending || (stats?.draftMessages ?? 0) === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Envoyer tout ({stats?.draftMessages ?? 0})
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-500 mb-1">Total prospects</div>
              <div className="text-2xl font-bold">{stats.totalProspects}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400" /> Hot (≥70)
              </div>
              <div className="text-2xl font-bold text-red-500">{stats.hot}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Warm (40-69)
              </div>
              <div className="text-2xl font-bold text-amber-500">{stats.warm}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-500 mb-1">Contactés</div>
              <div className="text-2xl font-bold text-purple-500">{stats.contacted}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="text-xs text-slate-500 mb-1">Ont répondu</div>
              <div className="text-2xl font-bold text-emerald-500">{stats.replied}</div>
            </div>
          </div>
        )}

        {/* Two columns: Prospects + Messages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prospects list */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Prospects ({prospects.length})
              </h3>
            </div>

            {prospects.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                Aucun prospect. Lancez le pipeline ou ajoutez-en manuellement.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {prospects.map((p) => {
                  const score = p.score ?? 0;
                  const scoreColor = score >= 70 ? "text-red-500 bg-red-50" : score >= 40 ? "text-amber-600 bg-amber-50" : "text-slate-400 bg-slate-50";
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition group">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${scoreColor}`}>
                        {score}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {p.company || "—"} {p.data?.role ? `· ${p.data.role}` : ""}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === "qualified" ? "bg-emerald-50 text-emerald-600" :
                        p.status === "contacted" ? "bg-purple-50 text-purple-600" :
                        p.status === "replied" ? "bg-blue-50 text-blue-600" :
                        "bg-slate-50 text-slate-400"
                      }`}>
                        {p.status}
                      </span>
                      <button
                        onClick={() => deleteProspect(p.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Messages list */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
                Messages ({messages.length})
              </h3>
            </div>

            {messages.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                Aucun message. Lancez le pipeline pour générer des emails.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {messages.map((msg) => {
                  const prospect = prospects.find((p) => p.id === msg.prospectId);
                  return (
                    <div key={msg.id} className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 transition">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium truncate">{msg.subject || "(sans sujet)"}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                          msg.status === "sent" ? "bg-emerald-50 text-emerald-600" :
                          msg.status === "bounced" ? "bg-red-50 text-red-500" :
                          "bg-amber-50 text-amber-600"
                        }`}>
                          {msg.status === "sent" ? "Envoyé" : msg.status === "bounced" ? "Échec" : "Brouillon"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">
                        À: {prospect?.name || "—"} {prospect?.email ? `(${prospect.email})` : ""}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-2">{msg.content}</p>
                      {msg.status === "draft" && (
                        <button
                          onClick={() => sendMessage(msg.id)}
                          className="text-xs text-brand-600 font-semibold hover:underline inline-flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          Envoyer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Manual prospect modal */}
        {showManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowManual(false)}>
            <div className="bg-white rounded-3xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">Ajouter un prospect</h3>
              <form onSubmit={addManualProspect} className="space-y-3">
                <input
                  type="text"
                  value={manualProspect.name}
                  onChange={(e) => setManualProspect({ ...manualProspect, name: e.target.value })}
                  required
                  placeholder="Nom complet"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                />
                <input
                  type="email"
                  value={manualProspect.email}
                  onChange={(e) => setManualProspect({ ...manualProspect, email: e.target.value })}
                  placeholder="Email"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                />
                <input
                  type="text"
                  value={manualProspect.company}
                  onChange={(e) => setManualProspect({ ...manualProspect, company: e.target.value })}
                  placeholder="Entreprise"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold"
                >
                  Ajouter
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
