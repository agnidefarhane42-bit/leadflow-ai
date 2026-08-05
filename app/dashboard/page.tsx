"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Users, Calendar, Target, Loader2 } from "lucide-react";

interface Lead {
  id: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  score: number;
  status: string;
  source: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-blue-100 text-blue-700",
  new: "bg-slate-100 text-slate-700",
  qualified: "bg-purple-100 text-purple-700",
  converted: "bg-emerald-100 text-emerald-700",
};

const statusLabels: Record<string, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  new: "Nouveau",
  qualified: "Qualifié",
  converted: "Converti",
};

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await fetch("/api/leads?limit=50");
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (err) {
      console.error("Failed to fetch leads:", err);
    } finally {
      setLoading(false);
    }
  };

  const totalLeads = leads.length;
  const hotLeads = leads.filter((l) => l.status === "hot").length;
  const convertedLeads = leads.filter((l) => l.status === "converted").length;
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  const stats = [
    { icon: Users, label: "Total leads", value: totalLeads.toString(), color: "from-brand-500 to-brand-600" },
    { icon: TrendingUp, label: "Leads chauds", value: hotLeads.toString(), color: "from-red-500 to-orange-500" },
    { icon: Calendar, label: "RDVs planifiés", value: convertedLeads.toString(), color: "from-emerald-500 to-teal-500" },
    { icon: Target, label: "Taux de conversion", value: `${conversionRate}%`, color: "from-purple-500 to-pink-500" },
  ];

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-slate-500">Vue d'ensemble de vos leads et rendez-vous</p>
          </div>
          <button onClick={fetchLeads}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium transition">
            Actualiser
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-lg transition">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="text-3xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Leads table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-xl font-semibold">Leads récents</h2>
          </div>
          {loading ? (
            <div className="px-6 py-16 text-center">
              <Loader2 className="w-8 h-8 mx-auto text-brand-500 animate-spin" />
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
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Source</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                        Aucun lead pour le moment. Partagez votre lien de qualification pour commencer !
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{lead.name}</div>
                          <div className="text-sm text-slate-400">{lead.email}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{lead.company || "—"}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{lead.score}</span>
                            <span className="text-xs text-slate-400">/170</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${statusColors[lead.status] || statusColors.new}`}>
                            {statusLabels[lead.status] || lead.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 capitalize">{lead.source || "—"}</td>
                        <td className="px-6 py-4 text-slate-500 text-sm">
                          {new Date(lead.created_at).toLocaleDateString("fr-FR")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
