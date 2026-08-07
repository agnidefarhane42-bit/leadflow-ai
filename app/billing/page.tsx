"use client";

import { useState, useEffect } from "react";
import { Coins, Loader2, CheckCircle, Clock, ArrowDown, ArrowUp } from "lucide-react";

interface Transaction {
  id: number;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

const CREDIT_BUNDLES = [
  { credits: 100, price: "5 000", priceUSD: "~8", popular: false },
  { credits: 500, price: "20 000", priceUSD: "~32", popular: true },
  { credits: 2000, price: "70 000", priceUSD: "~110", popular: false },
  { credits: 5000, price: "150 000", priceUSD: "~240", popular: false },
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

  useEffect(() => {
    fetchData();
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

  const handlePurchase = async (credits: number) => {
    setPurchasing(credits);
    // TODO: Integrate Fedapay/Paystack here
    // For now, show a message that payment integration is coming
    alert(`Paiement de ${credits} crédits — L'intégration Fedapay/Paystack sera configurée bientôt. Restez connecté !`);
    setPurchasing(null);
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

        {/* Current balance */}
        <div className="glass-card rounded-2xl p-6 mb-8 flex items-center justify-between">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
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
                  Meilleure offre
                </div>
              )}
              <div className="text-center">
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

        {/* Payment info */}
        <div className="mb-8 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-700">
          💡 Le paiement via <strong>Fedapay</strong> ou <strong>Paystack</strong> sera bientôt disponible.
          Vous pourrez acheter des crédits avec Mobile Money (MTN, Moov, Orange), carte bancaire, et plus encore.
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
