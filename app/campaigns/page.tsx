"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, Users, Trash2, Loader2, X, Sparkles, Target, ArrowRight } from "lucide-react";

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

interface Agent {
  id: number;
  name: string;
  slug: string;
  creditCost: number;
  icon: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "bg-slate-100 text-slate-600" },
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700" },
  paused: { label: "En pause", color: "bg-amber-100 text-amber-700" },
  completed: { label: "Terminée", color: "bg-blue-100 text-blue-700" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    agentId: "",
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
          agentId: newCampaign.agentId ? parseInt(newCampaign.agentId) : null,
          targetCriteria: Object.keys(targetCriteria).length > 0 ? targetCriteria : null,
          offerDescription: newCampaign.offerDescription || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setNewCampaign({ name: "", agentId: "", offerDescription: "", industry: "", location: "", companySize: "", role: "" });
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Campagnes</h1>
            <p className="text-slate-500">Créez et gérez vos campagnes de prospecting</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nouvelle campagne
          </button>
        </div>

        {/* Empty state */}
        {campaigns.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-brand-500" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucune campagne pour le moment</h3>
            <p className="text-slate-500 mb-6">Créez votre première campagne de prospecting</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold"
            >
              <Plus className="w-4 h-4" />
              Créer une campagne
            </button>
          </div>
        ) : (
          /* Campaigns grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((camp) => {
              const status = STATUS_LABELS[camp.status] || STATUS_LABELS.draft;
              return (
                <div
                  key={camp.id}
                  className="group p-6 rounded-2xl bg-white border border-slate-100 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/5 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                    <button
                      onClick={() => deleteCampaign(camp.id)}
                      className="text-slate-300 hover:text-red-500 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <Link href={`/campaigns/${camp.id}`}>
                    <h3 className="text-lg font-bold mb-2 group-hover:text-brand-600 transition">
                      {camp.name}
                    </h3>
                  </Link>

                  {camp.offerDescription && (
                    <p className="text-sm text-slate-500 mb-3 line-clamp-2">{camp.offerDescription}</p>
                  )}

                  {camp.targetCriteria && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {Object.entries(camp.targetCriteria).slice(0, 3).map(([key, value]: [string, any]) => (
                        <span key={key} className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-xs">
                          {key}: {value}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <div className="inline-flex items-center gap-1.5 text-slate-500">
                      <Users className="w-4 h-4" />
                      {camp.prospectCount} prospect{camp.prospectCount > 1 ? "s" : ""}
                    </div>
                    <Link
                      href={`/campaigns/${camp.id}`}
                      className="text-brand-600 font-semibold group-hover:underline inline-flex items-center gap-1"
                    >
                      Ouvrir <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowCreate(false)}>
            <div className="bg-white rounded-3xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Nouvelle campagne</h2>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-900">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={createCampaign} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom de la campagne *</label>
                  <input
                    type="text"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    required
                    placeholder="Ex: Prospection fintech Afrique de l'Ouest"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Que vendez-vous ? <span className="text-slate-400 font-normal">(décrivez votre offre)</span>
                  </label>
                  <textarea
                    value={newCampaign.offerDescription}
                    onChange={(e) => setNewCampaign({ ...newCampaign, offerDescription: e.target.value })}
                    rows={3}
                    placeholder="Ex: Nous proposons un service de automatisation marketing par IA pour les PME. Notre solution permet de générer des leads qualifiés automatiquement et d'envoyer des emails personnalisés sans effort."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition resize-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Cette description sera utilisée par l'IA pour personnaliser les emails de prospection.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">Critères de ciblage (optionnel)</p>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newCampaign.industry}
                      onChange={(e) => setNewCampaign({ ...newCampaign, industry: e.target.value })}
                      placeholder="Industrie (ex: fintech, santé, e-commerce)"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                    />
                    <input
                      type="text"
                      value={newCampaign.location}
                      onChange={(e) => setNewCampaign({ ...newCampaign, location: e.target.value })}
                      placeholder="Localisation (ex: Côte d'Ivoire, Sénégal)"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                    />
                    <input
                      type="text"
                      value={newCampaign.companySize}
                      onChange={(e) => setNewCampaign({ ...newCampaign, companySize: e.target.value })}
                      placeholder="Taille d'entreprise (ex: 10-50 employés)"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                    />
                    <input
                      type="text"
                      value={newCampaign.role}
                      onChange={(e) => setNewCampaign({ ...newCampaign, role: e.target.value })}
                      placeholder="Rôle cible (ex: CTO, Head of Product)"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all"
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
