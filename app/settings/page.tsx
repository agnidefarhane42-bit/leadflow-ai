"use client";

import { useState, useEffect } from "react";
import { User, Building2, Mail, Loader2, Save, CheckCircle, Download, Coins, Key, ExternalLink, Search } from "lucide-react";

interface UserInfo {
  email: string;
  fullName: string | null;
  company: string | null;
  apolloApiKey: string | null; // reused for Snov.io Client ID
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSnov, setSavingSnov] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedSnov, setSavedSnov] = useState(false);
  const [formData, setFormData] = useState({ fullName: "", company: "" });
  const [snovClientId, setSnovClientId] = useState("");
  const [snovClientSecret, setSnovClientSecret] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      setUser(data.user);
      setBalance(data.balance);
      setFormData({
        fullName: data.user?.fullName || "",
        company: data.user?.company || "",
      });
      setSnovClientId(data.user?.apolloApiKey || "");
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      setSaved(true);
      fetchData();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const saveSnovKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSnov(true);
    setSavedSnov(false);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apolloApiKey: snovClientId }), // stores Client ID
      });
      setSavedSnov(true);
      fetchData();
      setTimeout(() => setSavedSnov(false), 3000);
    } catch {
      // silent
    } finally {
      setSavingSnov(false);
    }
  };

  const exportCSV = () => {
    window.open("/api/prospects/export", "_blank");
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
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Paramètres</h1>
          <p className="text-slate-500">Gérez votre profil et vos intégrations</p>
        </div>

        {/* Profile */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-brand-500" />
            Profil
          </h2>

          {saved && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <CheckCircle className="w-4 h-4" />
              Profil mis à jour
            </div>
          )}

          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom complet</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Jean Kouassi"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Entreprise</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Mon Agence SARL"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </form>
        </div>

        {/* Snov.io Integration */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
            <Search className="w-5 h-5 text-brand-500" />
            Snov.io — Vrais emails de prospects
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Connectez Snov.io pour trouver de vrais prospects B2B avec emails vérifiés.
            Plan gratuit : 50 crédits/mois.{" "}
            <strong className="text-amber-600">Important :</strong> l'accès API sur le plan gratuit
            nécessite d'envoyer un email à{" "}
            <a href="mailto:help@snov.io" className="text-brand-600 font-medium hover:underline">help@snov.io</a>
            {" "}pour demander l'accès test (gratuit).
          </p>

          {savedSnov && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <CheckCircle className="w-4 h-4" />
              Identifiants Snov.io enregistrés
            </div>
          )}

          <form onSubmit={saveSnovKeys} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Snov.io Client ID</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={snovClientId}
                  onChange={(e) => setSnovClientId(e.target.value)}
                  placeholder="Votre Client ID Snov.io"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Snov.io Client Secret</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={snovClientSecret}
                  onChange={(e) => setSnovClientSecret(e.target.value)}
                  placeholder="Votre Client Secret Snov.io"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Créez un compte sur{" "}
                <a href="https://snov.io" target="_blank" rel="noopener noreferrer" className="text-brand-600 font-medium hover:underline inline-flex items-center gap-0.5">
                  snov.io <ExternalLink className="w-3 h-3" />
                </a>
                {" "}→ Settings → API → trouvez votre Client ID et Client Secret.
                Le Client Secret est configuré côté serveur (contactez l'admin).
              </p>
            </div>

            <button
              type="submit"
              disabled={savingSnov || !snovClientId}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition disabled:opacity-50"
            >
              {savingSnov ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {snovClientId ? "Mettre à jour" : "Connecter Snov.io"}
            </button>
          </form>

          {snovClientId && (
            <div className="mt-3 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs">
              ✅ Snov.io Client ID configuré — le Lead Finder utilisera Snov.io pour trouver de vrais prospects
            </div>
          )}
        </div>

        {/* Credits */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500" />
            Crédits LeadFlow
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">{balance}</p>
              <p className="text-sm text-slate-500">crédits restants</p>
            </div>
            <a
              href="/billing"
              className="px-5 py-2.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 transition"
            >
              Recharger
            </a>
          </div>
        </div>

        {/* Export */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-slate-500" />
            Export de données
          </h2>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition"
          >
            <Download className="w-4 h-4" />
            Exporter prospects (CSV)
          </button>
        </div>
      </div>
    </div>
  );
}
