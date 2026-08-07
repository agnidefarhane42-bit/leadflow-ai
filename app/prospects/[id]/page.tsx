"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail, Linkedin, MessageSquare, Send, Copy, Check, Trash2, Sparkles, Building2, User, Phone } from "lucide-react";

interface Prospect {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  score: number;
  status: string;
  data: any;
  source: string;
  createdAt: string;
}

interface OutreachMessage {
  id: number;
  type: string;
  subject: string | null;
  content: string;
  status: string;
  createdAt: string;
}

interface Agent {
  id: number;
  name: string;
  slug: string;
  creditCost: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Nouveau", color: "bg-slate-100 text-slate-600" },
  qualified: { label: "Qualifié", color: "bg-blue-100 text-blue-700" },
  contacted: { label: "Contacté", color: "bg-purple-100 text-purple-700" },
  replied: { label: "A répondu", color: "bg-emerald-100 text-emerald-700" },
  won: { label: "Gagné", color: "bg-green-100 text-green-700" },
  lost: { label: "Perdu", color: "bg-red-100 text-red-700" },
};

const STATUS_OPTIONS = [
  { value: "new", label: "Nouveau" },
  { value: "qualified", label: "Qualifié" },
  { value: "contacted", label: "Contacté" },
  { value: "replied", label: "A répondu" },
  { value: "won", label: "Gagné" },
  { value: "lost", label: "Perdu" },
];

export default function ProspectDetailPage() {
  const params = useParams();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  useEffect(() => {
    fetchData();
    fetchAgents();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/prospects/${params.id}`);
      const data = await res.json();
      setProspect(data.prospect);
      setMessages(data.messages || []);
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
      // Filter outreach-type agents
      const outreachAgents = (data.agents || []).filter((a: Agent) =>
        a.slug.includes("email") || a.slug.includes("linkedin") || a.slug.includes("follow")
      );
      setAgents(outreachAgents);
    } catch {
      // silent
    }
  };

  const generateOutreach = async (agentId: number) => {
    setGenerating(agentId);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: parseInt(params.id as string),
          agentId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch {
      // silent
    } finally {
      setGenerating(null);
    }
  };

  const updateStatus = async (status: string) => {
    try {
      await fetch(`/api/prospects/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch {
      // silent
    }
  };

  const copyMessage = (id: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="min-h-screen pt-24 text-center">
        <p className="text-slate-500">Prospect introuvable</p>
        <Link href="/prospects" className="text-brand-600 font-semibold mt-4 inline-block">Retour</Link>
      </div>
    );
  }

  const status = STATUS_LABELS[prospect.status] || STATUS_LABELS.new;
  const prospectData = prospect.data as Record<string, any> || {};

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Back */}
        <Link href="/prospects" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6 transition">
          <ArrowLeft className="w-4 h-4" />
          Prospects
        </Link>

        {/* Prospect info card */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                {prospect.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{prospect.name}</h1>
                {prospectData.role && <p className="text-slate-500">{prospectData.role}</p>}
              </div>
            </div>
            <span className={`inline-flex px-3 py-1.5 rounded-full text-sm font-medium ${status.color}`}>
              {status.label}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            {prospect.email && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                {prospect.email}
              </div>
            )}
            {prospect.company && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Building2 className="w-4 h-4 text-slate-400" />
                {prospect.company}
              </div>
            )}
            {prospect.phone && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                {prospect.phone}
              </div>
            )}
            {prospect.linkedinUrl && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Linkedin className="w-4 h-4 text-slate-400" />
                <a href={prospect.linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 truncate">
                  {prospect.linkedinUrl}
                </a>
              </div>
            )}
          </div>

          {prospectData.fitReason && (
            <div className="mt-4 p-3 rounded-lg bg-brand-50 text-sm text-brand-700">
              <span className="font-medium">Fit: </span>{prospectData.fitReason}
            </div>
          )}

          {/* Score + Status controls */}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Score IA:</span>
              <span className="text-2xl font-bold text-brand-600">{prospect.score}</span>
              <span className="text-slate-400 text-sm">/ 100</span>
            </div>

            {/* Status selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Statut:</span>
              <select
                value={prospect.status}
                onChange={(e) => updateStatus(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Generate outreach */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-500" />
            Générer un message d'outreach
          </h2>

          <div className="flex flex-wrap gap-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => generateOutreach(agent.id)}
                disabled={generating === agent.id}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-50 text-brand-700 font-medium hover:bg-brand-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating === agent.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  agent.slug.includes("linkedin") ? <Linkedin className="w-4 h-4" /> : <Mail className="w-4 h-4" />
                )}
                {agent.name}
                <span className="text-xs text-brand-400">({agent.creditCost} crédits)</span>
              </button>
            ))}
          </div>
        </div>

        {/* Outreach messages */}
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-slate-400" />
          Messages générés ({messages.length})
        </h2>

        {messages.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400">
            Aucun message pour le moment. Utilisez les boutons ci-dessus pour générer un email ou un message LinkedIn.
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="bg-white rounded-2xl border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {msg.type === "linkedin" ? (
                      <Linkedin className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Mail className="w-4 h-4 text-brand-500" />
                    )}
                    <span className="text-sm font-medium text-slate-700">
                      {msg.type === "linkedin" ? "LinkedIn" : "Email"}
                    </span>
                    {msg.subject && (
                      <span className="text-slate-400">• {msg.subject}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {new Date(msg.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <button
                      onClick={() => copyMessage(msg.id, msg.content)}
                      className="text-slate-400 hover:text-brand-600 transition"
                    >
                      {copiedId === msg.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4">
                  <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono">
                    {msg.content}
                  </pre>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                    msg.status === "draft" ? "bg-slate-100 text-slate-600" :
                    msg.status === "sent" ? "bg-blue-100 text-blue-700" :
                    msg.status === "replied" ? "bg-emerald-100 text-emerald-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {msg.status === "draft" ? "Brouillon" :
                     msg.status === "sent" ? "Envoyé" :
                     msg.status === "replied" ? "Répondu" : "Rejeté"}
                  </span>
                  <button
                    onClick={() => {
                      if (prospect.email) {
                        const mailto = `mailto:${prospect.email}?subject=${encodeURIComponent(msg.subject || "")}&body=${encodeURIComponent(msg.content)}`;
                        window.open(mailto, "_blank");
                      }
                    }}
                    disabled={!prospect.email}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {prospect.email ? "Ovrir dans email" : "Pas d'email"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
