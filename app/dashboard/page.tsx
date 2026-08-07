"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, Target, Mail, TrendingUp, Coins, Bot, ArrowRight, Plus, Sparkles } from "lucide-react";

interface DashboardData {
  balance: number;
  totalProspects: number;
  qualifiedProspects: number;
  contactedProspects: number;
  repliedProspects: number;
  totalCampaigns: number;
  activeCampaigns: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchStats(), fetchLeads()]);
  }, []);

  const fetchStats = async () => {
    try {
      const [creditsRes, prospectsRes, campaignsRes] = await Promise.all([
        fetch("/api/credits"),
        fetch("/api/prospects"),
        fetch("/api/campaigns"),
      ]);

      const credits = await creditsRes.json();
      const prospectsData = await prospectsRes.json();
      const campaignsData = await campaignsRes.json();

      const prospects = prospectsData.prospects || [];
      const campaigns = campaignsData.campaigns || [];

      setData({
        balance: credits.balance || 0,
        totalProspects: prospects.length,
        qualifiedProspects: prospects.filter((p: any) => p.status === "qualified").length,
        contactedProspects: prospects.filter((p: any) => p.status === "contacted").length,
        repliedProspects: prospects.filter((p: any) => p.status === "replied").length,
        totalCampaigns: campaigns.length,
        activeCampaigns: campaigns.filter((c: any) => c.status === "active").length,
      });
    } catch {
      // silent
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      setRecentLeads(data.leads || data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-slate-500">Vue d'ensemble de votre activité de prospecting</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/agents"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Lancer un agent
            </Link>
          </div>
        </div>

        {/* Credits banner */}
        <div className="glass-card rounded-2xl p-6 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Coins className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Vos crédits</p>
              <p className="text-3xl font-bold">{data.balance}</p>
            </div>
          </div>
          <Link
            href="/billing"
            className="px-5 py-2.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 transition"
          >
            Recharger
          </Link>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-lg transition">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mb-4">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{data.totalProspects}</div>
            <div className="text-sm text-slate-500 mt-1">Prospects</div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-lg transition">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{data.qualifiedProspects}</div>
            <div className="text-sm text-slate-500 mt-1">Qualifiés</div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-lg transition">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{data.contactedProspects}</div>
            <div className="text-sm text-slate-500 mt-1">Contactés</div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-lg transition">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{data.repliedProspects}</div>
            <div className="text-sm text-slate-500 mt-1">Ont répondu</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link href="/agents" className="group bg-white rounded-2xl border border-slate-100 p-6 hover:border-brand-200 hover:shadow-lg transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Bot className="w-6 h-6 text-brand-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900">Agents IA</h3>
                <p className="text-sm text-slate-500">6 agents de prospecting</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-1 transition" />
            </div>
          </Link>

          <Link href="/campaigns" className="group bg-white rounded-2xl border border-slate-100 p-6 hover:border-brand-200 hover:shadow-lg transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Target className="w-6 h-6 text-brand-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900">Campagnes</h3>
                <p className="text-sm text-slate-500">{data.totalCampaigns} campagne{data.totalCampaigns > 1 ? "s" : ""}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-1 transition" />
            </div>
          </Link>

          <Link href="/prospects" className="group bg-white rounded-2xl border border-slate-100 p-6 hover:border-brand-200 hover:shadow-lg transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-brand-500" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900">Prospects</h3>
                <p className="text-sm text-slate-500">{data.totalProspects} prospect{data.totalProspects > 1 ? "s" : ""}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-1 transition" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
