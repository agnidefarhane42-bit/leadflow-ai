"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, Users, BarChart3, Coins, Mail, Target, Zap, TrendingUp,
  AlertCircle, Loader2, Crown, Trash2, Plus, Activity, DollarSign,
} from "lucide-react";

interface AdminData {
  stats: {
    totalUsers: number;
    totalCampaigns: number;
    totalProspects: number;
    totalMessages: number;
    sentMessages: number;
    draftMessages: number;
    bouncedMessages: number;
    totalAgentRuns: number;
    totalLeads: number;
    totalCreditsInSystem: number;
    creditsSpent: number;
    creditsPurchased: number;
    planBreakdown: { free: number; pro: number; enterprise: number };
    estimatedMonthlyRevenue: number;
  };
  users: Array<{
    id: number;
    email: string;
    fullName: string | null;
    company: string | null;
    role: string | null;
    plan: string | null;
    createdAt: string;
  }>;
  campaigns: Array<{
    id: number;
    name: string;
    status: string;
    userId: number;
    createdAt: string;
  }>;
  agents: Array<{
    id: number;
    name: string;
    slug: string;
    creditCost: number;
    totalRuns: number;
    successful: number;
    failed: number;
  }>;
  recentTransactions: Array<{
    id: number;
    userId: number;
    amount: number;
    type: string;
    description: string | null;
    createdAt: string;
  }>;
  recentAgentRuns: Array<{
    id: number;
    userId: number;
    agentId: number;
    status: string;
    creditsConsumed: number;
    createdAt: string;
  }>;
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "users" | "agents" | "transactions">("overview");
  const [creditModal, setCreditModal] = useState<number | null>(null);
  const [creditAmount, setCreditAmount] = useState(50);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin");
      const d = await res.json();
      if (res.status === 403) {
        setError("Accès refusé. Vous n'êtes pas admin.");
        return;
      }
      if (!res.ok) {
        setError(d.error || "Erreur");
        return;
      }
      setData(d);
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateUser = async (userId: number, updates: any) => {
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      fetchData();
    } catch {
      // silent
    }
  };

  const deleteUser = async (userId: number) => {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try {
      await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      fetchData();
    } catch {
      // silent
    }
  };

  const grantCredits = async () => {
    if (creditModal && creditAmount > 0) {
      await updateUser(creditModal, { creditAmount });
      setCreditModal(null);
      setCreditAmount(50);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen pt-24 px-4 max-w-md mx-auto text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-lg font-semibold text-slate-900 mb-2">{error}</p>
        <Link href="/dashboard" className="text-brand-600 font-semibold">Retour au dashboard</Link>
      </div>
    );
  }

  if (!data) return null;

  const s = data.stats;

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="w-7 h-7 text-brand-500" />
              Admin Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-1">Vue d'ensemble complète du SaaS — accès illimité</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 text-sm font-semibold">
            <Crown className="w-4 h-4" />
            Admin
          </span>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { key: "overview", label: "Vue d'ensemble", icon: BarChart3 },
            { key: "users", label: "Utilisateurs", icon: Users },
            { key: "agents", label: "Agents IA", icon: Zap },
            { key: "transactions", label: "Transactions", icon: Coins },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Key metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-2">
                  <Users className="w-3.5 h-3.5" /> Utilisateurs
                </div>
                <div className="text-3xl font-bold">{s.totalUsers}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {s.planBreakdown.free} free · {s.planBreakdown.pro} pro · {s.planBreakdown.enterprise} enterprise
                </div>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-2">
                  <DollarSign className="w-3.5 h-3.5" /> Revenu estimé / mois
                </div>
                <div className="text-3xl font-bold text-emerald-500">{s.estimatedMonthlyRevenue}€</div>
                <div className="text-xs text-slate-400 mt-1">{s.planBreakdown.pro} × 20€/mois</div>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-2">
                  <Coins className="w-3.5 h-3.5" /> Crédits système
                </div>
                <div className="text-3xl font-bold text-amber-500">{s.totalCreditsInSystem}</div>
                <div className="text-xs text-slate-400 mt-1">{s.creditsSpent} dépensés · {s.creditsPurchased} achetés</div>
              </div>
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-center gap-2 text-slate-500 text-xs mb-2">
                  <Activity className="w-3.5 h-3.5" /> Exécutions agents
                </div>
                <div className="text-3xl font-bold text-purple-500">{s.totalAgentRuns}</div>
                <div className="text-xs text-slate-400 mt-1">total des runs IA</div>
              </div>
            </div>

            {/* Secondary metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-100 p-4">
                <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> Campagnes</div>
                <div className="text-2xl font-bold">{s.totalCampaigns}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-4">
                <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Prospects</div>
                <div className="text-2xl font-bold">{s.totalProspects}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-4">
                <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Emails envoyés</div>
                <div className="text-2xl font-bold text-emerald-500">{s.sentMessages}</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-100 p-4">
                <div className="text-xs text-slate-500 mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Bounces</div>
                <div className="text-2xl font-bold text-red-500">{s.bouncedMessages}</div>
              </div>
            </div>

            {/* Recent agent runs */}
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="font-bold flex items-center gap-2"><Activity className="w-4 h-4 text-slate-400" /> Runs récents</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {data.recentAgentRuns.length === 0 ? (
                  <div className="px-6 py-8 text-center text-slate-400 text-sm">Aucun run</div>
                ) : (
                  data.recentAgentRuns.map((run) => {
                    const agent = data.agents.find((a) => a.id === run.agentId);
                    const user = data.users.find((u) => u.id === run.userId);
                    const statusColor: Record<string, string> = {
                      completed: "text-emerald-600 bg-emerald-50",
                      running: "text-blue-600 bg-blue-50",
                      failed: "text-red-600 bg-red-50",
                    };
                    return (
                      <div key={run.id} className="px-6 py-3 border-b border-slate-50 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{agent?.name || `Agent #${run.agentId}`}</p>
                          <p className="text-xs text-slate-400">{user?.email || `User #${run.userId}`} · {new Date(run.createdAt).toLocaleString("fr-FR")}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-amber-600 font-medium">{run.creditsConsumed} cr</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[run.status] || statusColor.running}`}>
                            {run.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Utilisateurs ({data.users.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase">Nom</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase">Plan</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase">Rôle</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase">Inscrit le</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-6 py-3">
                        <p className="text-sm font-medium">{u.fullName || u.email}</p>
                        <p className="text-xs text-slate-400">{u.email} · {u.company || "—"}</p>
                      </td>
                      <td className="px-6 py-3">
                        <select
                          value={u.plan || "free"}
                          onChange={(e) => updateUser(u.id, { plan: e.target.value })}
                          className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                      </td>
                      <td className="px-6 py-3">
                        <select
                          value={u.role || "user"}
                          onChange={(e) => updateUser(u.id, { role: e.target.value })}
                          className={`text-xs px-2 py-1 rounded-lg border ${
                            u.role === "admin" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white"
                          }`}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCreditModal(u.id)}
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium hover:underline"
                          >
                            <Plus className="w-3 h-3" /> Crédits
                          </button>
                          {u.role !== "admin" && (
                            <button
                              onClick={() => deleteUser(u.id)}
                              className="text-slate-300 hover:text-red-500 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Credit modal */}
            {creditModal && (
              <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setCreditModal(null)}>
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-bold mb-4">Accorder des crédits</h3>
                  <input
                    type="number" min={1} value={creditAmount}
                    onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 mb-4 text-center text-2xl font-bold"
                  />
                  <button
                    onClick={grantCredits}
                    className="w-full py-2.5 rounded-lg bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition"
                  >
                    Accorder {creditAmount} crédits
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AGENTS TAB */}
        {tab === "agents" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.agents.map((agent) => {
              const successRate = agent.totalRuns > 0 ? Math.round((agent.successful / agent.totalRuns) * 100) : 0;
              return (
                <div key={agent.id} className="bg-white rounded-2xl border border-slate-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                      {agent.creditCost} cr/run
                    </span>
                  </div>
                  <h3 className="font-bold text-sm mb-1">{agent.name}</h3>
                  <p className="text-xs text-slate-400 mb-3">{agent.slug}</p>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center bg-slate-50 rounded-lg py-2">
                      <p className="text-lg font-bold">{agent.totalRuns}</p>
                      <p className="text-xs text-slate-400">Runs</p>
                    </div>
                    <div className="text-center bg-emerald-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-emerald-600">{agent.successful}</p>
                      <p className="text-xs text-slate-400">OK</p>
                    </div>
                    <div className="text-center bg-red-50 rounded-lg py-2">
                      <p className="text-lg font-bold text-red-500">{agent.failed}</p>
                      <p className="text-xs text-slate-400">Échecs</p>
                    </div>
                  </div>

                  {agent.totalRuns > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-400">Taux de succès</span>
                        <span className="font-semibold">{successRate}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${successRate}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TRANSACTIONS TAB */}
        {tab === "transactions" && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold flex items-center gap-2"><Coins className="w-4 h-4 text-slate-400" /> Transactions récentes ({data.recentTransactions.length})</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.recentTransactions.length === 0 ? (
                <div className="px-6 py-8 text-center text-slate-400 text-sm">Aucune transaction</div>
              ) : (
                data.recentTransactions.map((t) => {
                  const user = data.users.find((u) => u.id === t.userId);
                  const isPositive = t.amount > 0;
                  return (
                    <div key={t.id} className="px-6 py-3 border-b border-slate-50 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{t.description || t.type}</p>
                        <p className="text-xs text-slate-400">{user?.email || `User #${t.userId}`} · {new Date(t.createdAt).toLocaleString("fr-FR")}</p>
                      </div>
                      <span className={`text-sm font-bold ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                        {isPositive ? "+" : ""}{t.amount}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
