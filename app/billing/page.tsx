"use client";

import { useState, useEffect } from "react";
import { Coins, Loader2, CheckCircle, ArrowDown, ArrowUp, Shield, Smartphone, CreditCard } from "lucide-react";

interface Transaction {
  id: number;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

const CREDIT_BUNDLES = [
  { credits: 100, price: "5 000", priceUSD: "~8", popular: false, label: "Découverte" },
  { credits: 500, price: "20 000", priceUSD: "~32", popular: true, label: "Croissance" },
  { credits: 2000, price: "70 000", priceUSD: "~110", popular: false, label: "Scale" },
  { credits: 5000, price: "150 000", priceUSD: "~240", popular: false, label: "Entreprise" },
];

const TYPE_LABELS: Record<string, string> = {
  signup_bonus: "Crédits de bienvenue",
  purchase: "Achat de crédits",
  agent_run: "Utilisation d'agent",
  refund: "Remboursement",
};

export default function BillingPage() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData();
    checkConfig();
    // Check URL for payment return status
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status) {
      setPaymentStatus(status);
      // Clean URL
      window.history.replaceState({}, "", "/billing");
    }
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/credits");
      const data = await res.json();
      setBalance(data.balance || 0);
      setTransactions(data.transactions || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const checkConfig = async () => {
    try {
      const res = await fetch("/api/payment/fedapay");
      const data = await res.json();
      setIsConfigured(data.isConfigured || false);
    } catch {
      // silent
    }
  };

  const handlePurchase = async (credits: number) => {
    setPurchasing(credits);
    setError("");

    try {
      const res = await fetch("/api/payment/fedapay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors du paiement");
      } else if (data.mode === "development") {
        // Dev mode — credits added directly
        setBalance(data.balance);
        fetchData();
        setPaymentStatus("success_dev");
      } else if (data.checkoutUrl) {
        // Redirect to Fedapay checkout
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setError("Une erreur est survenue");
    } finally {
      setPurchasing(null);
    }
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
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Crédits & Facturation</h1>
          <p className="text-slate-500">Gérez votre solde de crédits et votre historique</p>
        </div>

        {/* Payment status notifications */}
        {paymentStatus === "success_dev" && (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Crédits ajoutés avec succès (mode développement) !
          </div>
        )}
        {paymentStatus === "success" && (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            Paiement confirmé ! Vos crédits ont été ajoutés.
          </div>
        )}
        {paymentStatus === "pending" && (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            <Loader2 className="w-4 h-4 flex-shrink-0" />
            Paiement en cours de traitement...
          </div>
        )}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Current balance */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Coins className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Solde actuel</p>
              <p className="text-3xl font-bold">{balance} crédits</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">1 crédit = 1 action d'agent</p>
          </div>
        </div>

        {/* Credit bundles */}
        <h2 className="text-xl font-bold mb-4">Acheter des crédits</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {CREDIT_BUNDLES.map((bundle) => (
            <div
              key={bundle.credits}
              className={`relative p-6 rounded-2xl transition-all ${
                bundle.popular
                  ? "bg-gradient-to-br from-brand-600 to-purple-700 text-white shadow-xl shadow-brand-500/20 scale-105"
                  : "bg-white border border-slate-200"
              }`}
            >
              {bundle.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white text-brand-600 text-xs font-bold">
                  Populaire
                </div>
              )}
              <div className="text-center">
                <div className="text-sm font-medium mb-1 opacity-80">{bundle.label}</div>
                <Coins className={`w-8 h-8 mx-auto mb-3 ${bundle.popular ? "text-amber-300" : "text-amber-500"}`} />
                <div className="text-3xl font-extrabold mb-1">{bundle.credits}</div>
                <p className={`text-sm mb-4 ${bundle.popular ? "text-brand-100" : "text-slate-500"}`}>crédits</p>
                <div className={`text-2xl font-bold mb-1 ${bundle.popular ? "text-white" : "text-slate-900"}`}>
                  {bundle.price} FCFA
                </div>
                <p className={`text-xs mb-4 ${bundle.popular ? "text-brand-200" : "text-slate-400"}`}>
                  ≈ ${bundle.priceUSD}
                </p>
                <button
                  onClick={() => handlePurchase(bundle.credits)}
                  disabled={purchasing === bundle.credits}
                  className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 ${
                    bundle.popular
                      ? "bg-white text-brand-600 hover:bg-brand-50"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  {purchasing === bundle.credits ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    "Acheter"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Payment methods info */}
        <div className="mb-8 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-blue-700 text-sm">Paiement sécurisé via Fedapay</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-blue-600 ml-8">
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" /> Mobile Money (MTN, Moov, Orange)
            </span>
            <span className="flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" /> Carte bancaire (Visa, Mastercard)
            </span>
          </div>
        </div>

        {/* Transaction history */}
        <h2 className="text-xl font-bold mb-4">Historique des transactions</h2>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {transactions.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-400">
              Aucune transaction pour le moment
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <div key={tx.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      tx.amount > 0 ? "bg-emerald-50" : "bg-red-50"
                    }`}>
                      {tx.amount > 0 ? (
                        <ArrowDown className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <ArrowUp className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {tx.description || TYPE_LABELS[tx.type] || tx.type}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(tx.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${tx.amount > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount} crédits
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
