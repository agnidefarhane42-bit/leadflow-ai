"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Loader2, Users, Target, Mail, TrendingUp, Percent, Coins,
  Bot, Award, ArrowDown, ChevronRight, BarChart3
} from "lucide-react";

interface AnalyticsData {
  funnel: {
    total: number;
    new: number;
    qualified: number;
    contacted: number;
    replied: number;
    won: number;
    lost: number;
  };
  conversionRates: {
    newToQualified: number;
    qualifiedToContacted: number;
    contactedToReplied: number;
    repliedToWon: number;
    overallWinRate: number;
  };
  outreachStats: {
    total: number;
    draft: number;
    sent: number;
    replied: number;
    bounced: number;
    responseRate: number;
  };
  agentUsage: Array<{
    agentId: number;
    agentName: string;
    agentSlug: string;
    runs: number;
    credits: number;
    successRate: number;
  }>;
  creditTrend: Array<{ date: string; earned: number; spent: number }>;
  campaignPerformance: Array<{
    id: number;
    name: string;
    status: string;
    prospectCount: number;
    contacted: number;
    replied: number;
    won: number;
    winRate: number;
  }>;
  summary: {
    totalProspects: number;
    totalMessages: number;
    totalCreditsSpent: number;
    totalAgentRuns: number;
    activeCampaigns: number;
    avgScore: number;
  };
}

const FUNNEL_STEPS = [
  { key: "total", label: "Total Prospects", icon: Users, color: "from-slate-500 to-slate-600" },
  { key: "qualified", label: "Qualifiés", icon: Target, color: "from-blue-500 to-blue-600" },
  { key: "contacted", label: "Contactés", icon: Mail, color: "from-purple-500 to-purple-600" },
  { key: "replied", label: "Ont répondu", icon: TrendingUp, color: "from-emerald-500 to-emerald-600" },
  { key: "won", label: "Gagnés", icon: Award, color: "from-green-500 to-green-600" },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch("/api/analytics");
      const d = await res.json();
      setData(d);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen pt-24 text-center">
        <p className="text-slate-500">Impossible de charger les analytics</p>
      </div>
    );
  }

  const maxTrend = Math.max(...data.creditTrend.flatMap((d) => [d.earned, d.spent]), 1);

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-brand-500" />
            Analytics
          </h1>
          <p className="text-slate-500">Analysez vos performances de prospecting</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[
            { label: "Prospects", value: data.summary.totalProspects, icon: Users, color: "text-brand-500" },
            { label: "Messages", value: data.summary.totalMessages, icon: Mail, color: "text-purple-500" },
            { label: "Crédits dépensés", value: data.summary.totalCreditsSpent, icon: Coins, color: "text-amber-500" },
            { label: "Runs d'agents", value: data.summary.totalAgentRuns, icon: Bot, color: "text-blue-500" },
            { label: "Campagnes actives", value: data.summary.activeCampaigns, icon: Target, color: "text-emerald-500" },
            { label: "Score moyen", value: `${data.summary.avgScore}/100`, icon: TrendingUp, color: "text-green-500" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-4">
              <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Funnel */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-bold mb-6">Funnel de conversion</h2>
          <div className="space-y-3">
            {FUNNEL_STEPS.map((step, i) => {
              const value = data.funnel[step.key as keyof typeof data.funnel];
              const prevValue = i === 0 ? value : data.funnel?.[FUNNEL_STEPS[i - 1].key as keyof typeof data.funnel] || value;
              const width = data.funnel.total > 0 ? Math.max((value / data.funnel.total) * 100, 5) : 0;
              const conversion = i > 0 && prevValue > 0 ? Math.round((value / prevValue) * 100) : 100;

              return (
                <div key={step.key} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-slate-600 flex items-center gap-2">
                    <step.icon className="w-4 h-4 text-slate-400" />
                    {step.label}
                  </div>
                  <div className="flex-1 relative">
                    <div className={`h-10 rounded-lg bg-gradient-to-r ${step.color} flex items-center justify-between px-4 transition-all`} style={{ width: `${width}%` }}>
                      <span className="text-white font-bold text-sm">{value}</span>
                      {i > 0 && (
                        <span className="text-white/80 text-xs">{conversion}%</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conversion rates + Outreach stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Conversion rates */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Percent className="w-5 h-5 text-brand-500" />
              Taux de conversion
            </h2>
            <div className="space-y-3">
              {[
                { label: "Nouveau → Qualifié", value: data.conversionRates.newToQualified },
                { label: "Qualifié → Contacté", value: data.conversionRates.qualifiedToContacted },
                { label: "Contacté → Répondu", value: data.conversionRates.contactedToReplied },
                { label: "Répondu → Gagné", value: data.conversionRates.repliedToWon },
              ].map((rate, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-600">{rate.label}</span>
                    <span className="text-sm font-bold text-slate-900">{rate.value}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-500 to-purple-600 rounded-full transition-all"
                      style={{ width: `${rate.value}%` }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">Taux de victoire global</span>
                  <span className="text-2xl font-bold text-emerald-600">{data.conversionRates.overallWinRate}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Outreach stats */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-purple-500" />
              Performance d'outreach
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-4 rounded-xl bg-slate-50">
                <div className="text-3xl font-bold text-slate-900">{data.outreachStats.total}</div>
                <div className="text-xs text-slate-500 mt-1">Total messages</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-purple-50">
                <div className="text-3xl font-bold text-purple-600">{data.outreachStats.sent}</div>
                <div className="text-xs text-slate-500 mt-1">Envoyés</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-emerald-50">
                <div className="text-3xl font-bold text-emerald-600">{data.outreachStats.replied}</div>
                <div className="text-xs text-slate-500 mt-1">Réponses</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-red-50">
                <div className="text-3xl font-bold text-red-500">{data.outreachStats.bounced}</div>
                <div className="text-xs text-slate-500 mt-1">Rejetés</div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Taux de réponse</span>
                <span className="text-2xl font-bold text-brand-600">{data.outreachStats.responseRate}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Credit trend (simple bar chart) */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500" />
            Tendance des crédits (30 derniers jours)
          </h2>
          <div className="flex items-end gap-1 h-40">
            {data.creditTrend.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                {day.spent > 0 && (
                  <div
                    className="w-full bg-red-400 rounded-t hover:bg-red-500 transition cursor-default"
                    style={{ height: `${(day.spent / maxTrend) * 60}%` }}
                    title={`Dépensé: ${day.spent}`}
                  />
                )}
                {day.earned > 0 && (
                  <div
                    className="w-full bg-emerald-400 rounded-b hover:bg-emerald-500 transition cursor-default"
                    style={{ height: `${(day.earned / maxTrend) * 60}%` }}
                    title={`Gagné: ${day.earned}`}
                  />
                )}
                {day.earned === 0 && day.spent === 0 && (
                  <div className="w-full h-1 bg-slate-100 rounded" />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-400" /> Crédits gagnés
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-red-400" /> Crédits dépensés
            </span>
          </div>
        </div>

        {/* Agent usage */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-500" />
            Utilisation des agents IA
          </h2>
          {data.agentUsage.length === 0 ? (
            <p className="text-slate-400 text-center py-8">Aucun agent utilisé pour le moment</p>
          ) : (
            <div className="space-y-3">
              {data.agentUsage.map((agent, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{agent.agentName}</span>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>{agent.runs} runs</span>
                        <span>{agent.credits} crédits</span>
                        <span className={agent.successRate >= 80 ? "text-emerald-600" : agent.successRate >= 50 ? "text-amber-600" : "text-red-600"}>
                          {agent.successRate}% succès
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-purple-600 rounded-full"
                        style={{ width: `${(agent.runs / Math.max(...data.agentUsage.map((a) => a.runs))) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campaign performance */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Target className="w-5 h-5 text-brand-500" />
              Performance des campagnes
            </h2>
            <Link href="/campaigns" className="text-sm text-brand-600 font-medium hover:underline">
              Voir tout →
            </Link>
          </div>
          {data.campaignPerformance.length === 0 ? (
            <p className="text-slate-400 text-center py-8">
              Aucune campagne.
              <Link href="/campaigns" className="text-brand-600 font-medium ml-1">Créer une campagne</Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                    <th className="pb-3">Campagne</th>
                    <th className="pb-3">Prospects</th>
                    <th className="pb-3">Contactés</th>
                    <th className="pb-3">Réponses</th>
                    <th className="pb-3">Gagnés</th>
                    <th className="pb-3">Taux victoire</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.campaignPerformance.map((camp) => (
                    <tr key={camp.id} className="hover:bg-slate-50 transition">
                      <td className="py-3">
                        <Link href={`/campaigns/${camp.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                          {camp.name}
                        </Link>
                      </td>
                      <td className="py-3 text-slate-600">{camp.prospectCount}</td>
                      <td className="py-3 text-slate-600">{camp.contacted}</td>
                      <td className="py-3 text-slate-600">{camp.replied}</td>
                      <td className="py-3 text-emerald-600 font-medium">{camp.won}</td>
                      <td className="py-3">
                        <span className={`font-bold ${camp.winRate >= 20 ? "text-emerald-600" : camp.winRate >= 5 ? "text-amber-600" : "text-slate-400"}`}>
                          {camp.winRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
