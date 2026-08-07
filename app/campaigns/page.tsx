"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus, Users, Trash2, Loader2, X, Target, ArrowRight,
  Search, Sparkles, TrendingUp, Mail, Zap,
} from "lucide-react";

interface Campaign {
  id: number;
  name: string;
  status: string;
  agentId: number | null;
  targetCriteria: any;
  offerDescription: string | null;
  prospectCount: number;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  draft: { label: "Brouillon", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" },
  active: { label: "Active", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  paused: { label: "En pause", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 ring-amber-200" },
  completed: { label: "Terminée", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 ring-blue-200" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    offerDescription: "",
    industry: "",
    location: "",
    companySize: "",
    role: "",
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCriteria: any = {};
    if (newCampaign.industry) targetCriteria.industry = newCampaign.industry;
    if (newCampaign.location) targetCriteria.location = newCampaign.location;
    if (newCampaign.companySize) targetCriteria.companySize = newCampaign.companySize;
    if (newCampaign.role) targetCriteria.role = newCampaign.role;

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampaign.name,
          targetCriteria: Object.keys(targetCriteria).length > 0 ? targetCriteria : null,
          offerDescription: newCampaign.offerDescription || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setNewCampaign({ name: "", offerDescription: "", industry: "", location: "", companySize: "", role: "" });
        fetchCampaigns();
      }
    } catch {
      // silent
    }
  };

  const deleteCampaign = async (id: number) => {
    if (!confirm("Supprimer cette campagne ? Les prospects seront conservés.")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    fetchCampaigns();
  };

  const totalProspects = campaigns.reduce((sum, c) => sum + (c.prospectCount || 0), 0);
  const activeCount = campaigns.filter((c) => c.status === "active").length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
          <p className="text-sm text-slate-400">Chargement des campagnes…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Campagnes</h1>
            <p className="text-slate-500 text-sm">Créez et gérez vos campagnes de prospecting</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-all shadow-sm hover:shadow-md hover:shadow-brand-500/25 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Nouvelle campagne
          </button>
        </div>

        {/* Stats bar */}
        {campaigns.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="rounded-xl bg-white border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Target className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Campagnes</span>
              </div>
              <p className="text-2xl font-bold">{campaigns.length}</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Prospects</span>
              </div>
              <p className="text-2xl font-bold">{totalProspects}</p>
            </div>
            <div className="rounded-xl bg-white border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Actives</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {campaigns.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-brand-500" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucune campagne pour le moment</h3>
            <p className="text-slate-500 mb-6 text-sm">Créez votre première campagne de prospecting</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              Créer une campagne
            </button>
          </div>
        ) : (
          /* Campaigns grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {campaigns.map((camp) => {
              const status = STATUS_CONFIG[camp.status] || STATUS_CONFIG.draft;
              return (
                <Link
                  key={camp.id}
                  href={`/campaigns/${camp.id}`}
                  className="group relative p-6 rounded-2xl bg-white border border-slate-100 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/5 transition-all overflow-hidden"
                >
                  {/* Top accent line */}
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${camp.status === "active" ? "bg-gradient-to-r from-brand-500 to-purple-500" : "bg-transparent"}`} />

                  {/* Status + Delete */}
                  <div className="flex items-start justify-between mb-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${status.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteCampaign(camp.id);
                      }}
                      className="text-slate-300 hover:text-red-500 transition p-1 -m-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Name */}
                  <h3 className="text-lg font-bold mb-2 group-hover:text-brand-600 transition">
                    {camp.name}
                  </h3>

                  {/* Offer */}
                  {camp.offerDescription && (
                    <p className="text-sm text-slate-500 mb-4 line-clamp-2 leading-relaxed">{camp.offerDescription}</p>
                  )}

                  {/* Criteria chips */}
                  {camp.targetCriteria && Object.keys(camp.targetCriteria).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-5">
                      {Object.entries(camp.targetCriteria).slice(0, 4).map(([key, value]: [string, any]) => (
                        <span key={key} className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-xs border border-slate-100">
                          {value}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="inline-flex items-center gap-1.5 text-slate-400 text-sm">
                      <Users className="w-4 h-4" />
                      <span className="font-medium text-slate-600">{camp.prospectCount}</span>
                      <span className="text-xs">prospect{camp.prospectCount > 1 ? "s" : ""}</span>
                    </div>
                    <span className="text-brand-600 font-semibold text-sm group-hover:underline inline-flex items-center gap-1">
                      Ouvrir <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
            <div
              className="bg-white rounded-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold">Nouvelle campagne</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Configurez votre prospection IA</p>
                </div>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-900 p-1 -m-1 rounded-lg hover:bg-slate-50 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={createCampaign} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom de la campagne *</label>
                  <input
                    type="text"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    required
                    placeholder="Ex: Prospection fintech Afrique de l'Ouest"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Que vendez-vous ? <span className="text-slate-400 font-normal">(décrivez votre offre)</span>
                  </label>
                  <textarea
                    value={newCampaign.offerDescription}
                    onChange={(e) => setNewCampaign({ ...newCampaign, offerDescription: e.target.value })}
                    rows={3}
                    placeholder="Ex: Nous proposons un service d'automatisation marketing par IA pour les PME. Notre solution permet de générer des leads qualifiés automatiquement et d'envoyer des emails personnalisés sans effort."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition resize-none text-sm"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">
                    Cette description sera utilisée par l'IA pour personnaliser les emails de prospection.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Critères de ciblage</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={newCampaign.industry}
                      onChange={(e) => setNewCampaign({ ...newCampaign, industry: e.target.value })}
                      placeholder="Industrie"
                      className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
                    />
                    <input
                      type="text"
                      value={newCampaign.location}
                      onChange={(e) => setNewCampaign({ ...newCampaign, location: e.target.value })}
                      placeholder="Localisation"
                      className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
                    />
                    <input
                      type="text"
                      value={newCampaign.companySize}
                      onChange={(e) => setNewCampaign({ ...newCampaign, companySize: e.target.value })}
                      placeholder="Taille entreprise"
                      className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
                    />
                    <input
                      type="text"
                      value={newCampaign.role}
                      onChange={(e) => setNewCampaign({ ...newCampaign, role: e.target.value })}
                      placeholder="Rôle cible"
                      className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
                >
                  Créer la campagne
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
