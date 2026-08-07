"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  { key: "send", label: "Envoi", description: "Envoi des emails via Resend", icon: Send, credits: 0 },
];

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = parseInt(params.id as string);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);

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
      const [campRes, statsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`),
        fetch(`/api/campaigns/${campaignId}/run`),
      ]);
      const campData = await campRes.json();
      const statsData = await statsRes.json();

      setCampaign(campData.campaign);
      setProspects(campData.prospects || []);

      // Fetch messages
      const msgRes = await fetch(`/api/outreach?campaignId=${campaignId}`);
      const msgData = await msgRes.json();
      setMessages(msgData.messages || []);

      setStats(statsData.stats || null);
    } catch {
      // silent
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

  if (!campaign) {
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

        {/* Two columns: prospects + messages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prospects table */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Prospects ({prospects.length})
              </h3>
            </div>

            {prospects.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-400">
                <Search className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">Aucun prospect. Lancez le pipeline pour commencer.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {prospects.map((p) => {
                  const scoreColor = p.score >= 70 ? "text-red-500 bg-red-50" : p.score >= 40 ? "text-amber-600 bg-amber-50" : "text-slate-500 bg-slate-50";
                  return (
                    <div key={p.id} className="px-6 py-3 border-b border-slate-50 hover:bg-slate-50 transition flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {p.company || "—"}{(p.data as any)?.role ? ` · ${(p.data as any).role}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${scoreColor}`}>
                          {p.score}
                        </span>
                        <button
                          onClick={() => deleteProspect(p.id)}
                          className="text-slate-300 hover:text-red-500 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Messages list */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
                Messages générés ({messages.length})
              </h3>
            </div>

            {messages.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-400">
                <Mail className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">Aucun message. Lancez le pipeline pour générer des emails.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {messages.map((msg) => {
                  const prospect = prospects.find((p) => p.id === msg.prospectId);
                  const statusBadge: Record<string, string> = {
                    draft: "bg-slate-100 text-slate-600",
                    sent: "bg-emerald-100 text-emerald-700",
                    bounced: "bg-red-100 text-red-600",
                    replied: "bg-blue-100 text-blue-700",
                  };
                  return (
                    <div key={msg.id} className="px-6 py-4 border-b border-slate-50 hover:bg-slate-50 transition">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-sm">{prospect?.name || "—"}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[msg.status] || statusBadge.draft}`}>
                          {msg.status === "draft" ? "Brouillon" : msg.status === "sent" ? "Envoyé" : msg.status === "bounced" ? "Échec" : msg.status}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-600 mb-1">{msg.subject}</p>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-2">{msg.content}</p>
                      {msg.status === "draft" && (
                        <button
                          onClick={() => sendMessage(msg.id)}
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:underline"
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
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowManual(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">Ajouter un prospect manuellement</h3>
              <form onSubmit={addManualProspect} className="space-y-3">
                <input
                  type="text" required placeholder="Nom complet" value={manualProspect.name}
                  onChange={(e) => setManualProspect({ ...manualProspect, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-100 focus:border-brand-400 outline-none"
                />
                <input
                  type="email" placeholder="Email" value={manualProspect.email}
                  onChange={(e) => setManualProspect({ ...manualProspect, email: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-100 focus:border-brand-400 outline-none"
                />
                <input
                  type="text" placeholder="Entreprise" value={manualProspect.company}
                  onChange={(e) => setManualProspect({ ...manualProspect, company: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-brand-100 focus:border-brand-400 outline-none"
                />
                <button type="submit" className="w-full py-2.5 rounded-lg bg-brand-500 text-white font-semibold hover:bg-brand-600 transition">
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
