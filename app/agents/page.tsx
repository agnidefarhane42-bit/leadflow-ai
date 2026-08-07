"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Zap, Search, Mail, Repeat, Target, Linkedin, MessageSquareReply, Coins, Loader2, Sparkles, AlertCircle, ArrowLeft } from "lucide-react";

const ICONS: Record<string, any> = {
  Search,
  Mail,
  Repeat,
  Target,
  Linkedin,
  MessageSquareReply,
};

interface Agent {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  creditCost: number;
  category: string;
}

interface AgentRunResult {
  content: string;
  parsed: any;
  creditsConsumed: number;
  balance: number;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents/run");
      const data = await res.json();
      setAgents(data.agents || []);
      setBalance(data.balance || 0);
    } catch {
      setError("Erreur lors du chargement des agents");
    } finally {
      setLoading(false);
    }
  };

  const runAgent = async () => {
    if (!selectedAgent || !input.trim()) return;
    setRunning(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          input,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'exécution");
      } else {
        setResult(data.content);
        setBalance(data.balance);
      }
    } catch {
      setError("Une erreur est survenue");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  // Agent execution view
  if (selectedAgent) {
    const Icon = ICONS[selectedAgent.icon] || Zap;
    return (
      <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => {
              setSelectedAgent(null);
              setResult(null);
              setInput("");
            }}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux agents
          </button>

          <div className="glass-card rounded-3xl p-8 shadow-lg">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                <Icon className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{selectedAgent.name}</h1>
                <p className="text-slate-500 text-sm">{selectedAgent.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-6 text-sm">
              <Coins className="w-4 h-4 text-amber-500" />
              <span className="font-semibold">{selectedAgent.creditCost} crédits</span>
              <span className="text-slate-400">par utilisation</span>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Input */}
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Décrivez ce que vous voulez que l'agent fasse
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={6}
              placeholder={`Ex: Trouvez des prospects dans le secteur fintech en Afrique de l'Ouest, taille 10-50 employés, rôles: CTO, Head of Product...`}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition resize-none"
            />

            <button
              onClick={runAgent}
              disabled={running || !input.trim() || balance < selectedAgent.creditCost}
              className="mt-4 w-full py-3 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  L'agent travaille...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Lancer l'agent ({selectedAgent.creditCost} crédits)
                </>
              )}
            </button>

            {balance < selectedAgent.creditCost && (
              <p className="mt-3 text-center text-sm text-red-500">
                Crédits insuffisants.{" "}
                <Link href="/billing" className="font-semibold underline">
                  Acheter des crédits
                </Link>
              </p>
            )}

            {/* Result */}
            {result && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-emerald-600">Résultat généré</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                  <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono">
                    {result}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Agent catalog view
  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Agents IA</h1>
            <p className="text-slate-500">Choisissez un agent pour automatiser votre prospecting</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <Coins className="w-5 h-5 text-amber-500" />
            <span className="font-bold text-amber-700">{balance}</span>
            <span className="text-amber-600 text-sm">crédits</span>
            <Link href="/billing" className="ml-2 text-sm text-amber-700 font-semibold hover:underline">
              Recharger
            </Link>
          </div>
        </div>

        {/* Agents grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => {
            const Icon = ICONS[agent.icon] || Zap;
            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className="group p-6 rounded-2xl bg-white border border-slate-100 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/5 transition-all cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6 text-brand-500" />
                </div>
                <h3 className="text-lg font-bold mb-2">{agent.name}</h3>
                <p className="text-sm text-slate-500 mb-4 line-clamp-3">{agent.description}</p>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                    <Coins className="w-3.5 h-3.5" />
                    {agent.creditCost} crédits
                  </span>
                  <span className="text-brand-600 text-sm font-semibold group-hover:underline">
                    Utiliser →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
