"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Mail, Search, Users, Target, Trash2, Filter } from "lucide-react";

interface Prospect {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  score: number;
  status: string;
  data: any;
  campaignId: number | null;
  messageCount: number;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Nouveau", color: "bg-slate-100 text-slate-600" },
  qualified: { label: "Qualifié", color: "bg-blue-100 text-blue-700" },
  contacted: { label: "Contacté", color: "bg-purple-100 text-purple-700" },
  replied: { label: "A répondu", color: "bg-emerald-100 text-emerald-700" },
  won: { label: "Gagné", color: "bg-green-100 text-green-700" },
  lost: { label: "Perdu", color: "bg-red-100 text-red-700" },
};

const FILTERS = ["all", "new", "qualified", "contacted", "replied", "won", "lost"];

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchProspects();
  }, []);

  const fetchProspects = async () => {
    try {
      const res = await fetch("/api/prospects");
      const data = await res.json();
      setProspects(data.prospects || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const deleteProspect = async (id: number) => {
    if (!confirm("Supprimer ce prospect ?")) return;
    await fetch(`/api/prospects/${id}`, { method: "DELETE" });
    fetchProspects();
  };

  const generateOutreach = async (prospectId: number) => {
    // Find cold-email-writer agent
    try {
      const agentsRes = await fetch("/api/agents/run");
      const agentsData = await agentsRes.json();
      const emailAgent = agentsData.agents?.find((a: any) => a.slug === "cold-email-writer");
      if (!emailAgent) return;

      await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId, agentId: emailAgent.id }),
      });
      fetchProspects();
    } catch {
      // silent
    }
  };

  // Filter prospects
  let filtered = prospects;
  if (filter !== "all") {
    filtered = filtered.filter((p) => p.status === filter);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false) ||
        (p.company?.toLowerCase().includes(q) ?? false)
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Prospects</h1>
          <p className="text-slate-500">Tous vos prospects, toutes campagnes confondues</p>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, email, entreprise..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  filter === f
                    ? "bg-brand-500 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-brand-300"
                }`}
              >
                {f === "all" ? "Tous" : STATUS_LABELS[f]?.label || f}
              </button>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="text-sm text-slate-500 mb-1">Total</div>
            <div className="text-2xl font-bold">{prospects.length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="text-sm text-slate-500 mb-1">Qualifiés</div>
            <div className="text-2xl font-bold">{prospects.filter((p) => p.status === "qualified").length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="text-sm text-slate-500 mb-1">Contactés</div>
            <div className="text-2xl font-bold">{prospects.filter((p) => p.status === "contacted").length}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="text-sm text-slate-500 mb-1">Ont répondu</div>
            <div className="text-2xl font-bold">{prospects.filter((p) => p.status === "replied").length}</div>
          </div>
        </div>

        {/* Prospects table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-400">
              {prospects.length === 0 ? (
                <>
                  <Users className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                  Aucun prospect pour le moment.
                  <br />
                  Créez une campagne et générez des prospects avec l'IA.
                  <br />
                  <Link href="/campaigns" className="text-brand-600 font-semibold mt-3 inline-block">
                    Voir les campagnes →
                  </Link>
                </>
              ) : (
                "Aucun prospect ne correspond à ce filtre."
              )}
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
                  {filtered.map((p) => {
                    const status = STATUS_LABELS[p.status] || STATUS_LABELS.new;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          {p.email && <div className="text-xs text-slate-400">{p.email}</div>}
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
    </div>
  );
}
