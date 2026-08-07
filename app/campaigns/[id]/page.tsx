"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles, Users, Target, Mail, Linkedin, Coins, Plus, Trash2, Search } from "lucide-react";

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
  messageCount: number;
}

interface Agent {
  id: number;
  name: string;
  creditCost: number;
  slug: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Nouveau", color: "bg-slate-100 text-slate-600" },
  qualified: { label: "Qualifié", color: "bg-blue-100 text-blue-700" },
  contacted: { label: "Contacté", color: "bg-purple-100 text-purple-700" },
  replied: { label: "A répondu", color: "bg-emerald-100 text-emerald-700" },
  won: { label: "Gagné", color: "bg-green-100 text-green-700" },
  lost: { label: "Perdu", color: "bg-red-100 text-red-700" },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualProspect, setManualProspect] = useState({ name: "", email: "", company: "" });
  const [outreachAgent, setOutreachAgent] = useState<string>("");
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    fetchData();
    fetchAgents();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/campaigns/${params.id}`);
      const data = await res.json();
      setCampaign(data.campaign);
      setAgent(data.agent);
      setProspects(data.prospects || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents/run");
      const data = await res.json();
      setAgents(data.agents || []);
    } catch {
      // silent
    }
  };

  const generateProspects = async () => {
    setGenerating(true);
    try {
      const leadFinder = agents.find((a) => a.slug === "lead-finder");
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          campaignId: parseInt(params.id as string),
          agentId: leadFinder?.id,
          criteria: campaign?.targetCriteria || {},
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch {
      // silent
    } finally {
      setGenerating(false);
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
          campaignId: parseInt(params.id as string),
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

  const generateOutreach = async (prospectId: number) => {
    const outreachAgentId = agents.find((a) => a.slug === "cold-email-writer")?.id;
    if (!outreachAgentId) return;

    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId,
          agentId: outreachAgentId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
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

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Back link */}
        <Link href="/campaigns" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 transition">
          <ArrowLeft className="w-4 h-4" />
          Campagnes
        </Link>

        {/* Campaign header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{campaign.name}</h1>
            {campaign.targetCriteria && (
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(campaign.targetCriteria).map(([key, value]: [string, any]) => (
                  <span key={key} className="px-3 py-1 rounded-lg bg-slate-50 text-slate-600 text-sm">
                    <span className="font-medium text-slate-400">{key}:</span> {value}
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
              Ajouter
            </button>
            <button
              onClick={generateProspects}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Générer des prospects (5 crédits)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Users className="w-4 h-4" /> Prospects
            </div>
            <div className="text-2xl font-bold">{prospects.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Target className="w-4 h-4" /> Qualifiés
            </div>
            <div className="text-2xl font-bold">{prospects.filter((p) => p.status === "qualified").length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Mail className="w-4 h-4" /> Contactés
            </div>
            <div className="text-2xl font-bold">{prospects.filter((p) => p.status === "contacted").length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
              <Sparkles className="w-4 h-4" /> Ont répondu
            </div>
            <div className="text-2xl font-bold">{prospects.filter((p) => p.status === "replied").length}</div>
          </div>
        </div>

        {/* Prospects table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {prospects.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              Aucun prospect dans cette campagne.
              <br />
              Utilisez "Générer des prospects" pour utiliser l'agent IA Lead Finder.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Nom</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Entreprise</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Statut</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Messages</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prospects.map((p) => {
                    const status = STATUS_LABELS[p.status] || STATUS_LABELS.new;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          {p.data?.role && <div className="text-xs text-slate-400">{p.data.role}</div>}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{p.company || "—"}</td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900">{p.score}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{p.messageCount || 0}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => generateOutreach(p.id)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 font-medium hover:bg-brand-100 transition inline-flex items-center gap-1"
                            >
                              <Mail className="w-3.5 h-3.5" /> Email IA
                            </button>
                            <button
                              onClick={() => deleteProspect(p.id)}
                              className="text-slate-300 hover:text-red-500 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Manual prospect modal */}
      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowManual(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-6">Ajouter un prospect</h2>
            <form onSubmit={addManualProspect} className="space-y-4">
              <input
                type="text"
                value={manualProspect.name}
                onChange={(e) => setManualProspect({ ...manualProspect, name: e.target.value })}
                required
                placeholder="Nom *"
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
                className="w-full py-3 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold"
              >
                Ajouter
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
