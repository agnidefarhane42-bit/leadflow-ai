import { Coins, Check, Sparkles, Zap, TrendingUp, Building2 } from "lucide-react";

const bundles = [
  {
    name: "Découverte",
    credits: "100",
    price: "5 000",
    currency: "FCFA",
    description: "Pour tester les agents",
    features: [
      "100 crédits IA",
      "Tous les agents disponibles",
      "Dashboard complet",
      "Support communautaire",
    ],
    highlighted: false,
    icon: Zap,
  },
  {
    name: "Croissance",
    credits: "500",
    price: "20 000",
    currency: "FCFA",
    description: "Le plus populaire",
    features: [
      "500 crédits IA",
      "Tous les agents disponibles",
      "Campagnes de prospecting",
      "Historique complet",
      "Support prioritaire",
    ],
    highlighted: true,
    icon: TrendingUp,
  },
  {
    name: "Scale",
    credits: "2000",
    price: "70 000",
    currency: "FCFA",
    description: "Pour les agences",
    features: [
      "2000 crédits IA",
      "Tous les agents disponibles",
      "Campagnes illimitées",
      "API d'intégration",
      "Support dédié",
    ],
    highlighted: false,
    icon: Building2,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Payez à l'usage, <span className="gradient-text">sans abonnement</span>
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Achetez des crédits et utilisez-les quand vous voulez. Pas d'engagement, pas de mensualité.
            10 crédits offerts à l'inscription.
          </p>
        </div>

        {/* Bundles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {bundles.map((bundle, i) => (
            <div
              key={i}
              className={`relative p-8 rounded-3xl transition-all ${
                bundle.highlighted
                  ? "bg-gradient-to-br from-brand-600 to-purple-700 text-white shadow-2xl shadow-brand-500/20 scale-105"
                  : "bg-white border border-slate-200"
              }`}
            >
              {bundle.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-4 py-1 rounded-full bg-white text-brand-600 text-xs font-semibold">
                  <Sparkles className="w-3 h-3" /> Recommandé
                </div>
              )}

              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                bundle.highlighted ? "bg-white/20" : "bg-brand-50"
              }`}>
                <bundle.icon className={`w-6 h-6 ${bundle.highlighted ? "text-white" : "text-brand-500"}`} />
              </div>

              <h3 className={`text-xl font-bold mb-1 ${bundle.highlighted ? "text-white" : "text-slate-900"}`}>
                {bundle.name}
              </h3>
              <p className={`text-sm mb-6 ${bundle.highlighted ? "text-brand-100" : "text-slate-500"}`}>
                {bundle.description}
              </p>

              {/* Credits */}
              <div className="flex items-baseline gap-2 mb-2">
                <Coins className={`w-6 h-6 ${bundle.highlighted ? "text-amber-300" : "text-amber-500"}`} />
                <span className={`text-3xl font-extrabold ${bundle.highlighted ? "text-white" : "text-slate-900"}`}>
                  {bundle.credits}
                </span>
                <span className={`text-sm ${bundle.highlighted ? "text-brand-100" : "text-slate-500"}`}>
                  crédits
                </span>
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-1 mb-8">
                <span className={`text-2xl font-bold ${bundle.highlighted ? "text-white" : "text-slate-900"}`}>
                  {bundle.price}
                </span>
                <span className={`text-lg ${bundle.highlighted ? "text-brand-200" : "text-slate-400"}`}>
                  {bundle.currency}
                </span>
              </div>

              <ul className="space-y-3 mb-8">
                {bundle.features.map((feature, j) => (
                  <li key={j} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      bundle.highlighted ? "bg-white/20" : "bg-emerald-50"
                    }`}>
                      <Check className={`w-3 h-3 ${bundle.highlighted ? "text-white" : "text-emerald-500"}`} />
                    </div>
                    <span className={`text-sm ${bundle.highlighted ? "text-brand-50" : "text-slate-700"}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href="/signup"
                className={`block w-full py-3.5 rounded-xl font-semibold text-center transition-all ${
                  bundle.highlighted
                    ? "bg-white text-brand-600 hover:bg-brand-50"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                Commencer
              </a>
            </div>
          ))}
        </div>

        {/* Payment methods */}
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-400">
            Paiement via Mobile Money, carte bancaire, et plus encore — bientôt disponible
          </p>
        </div>
      </div>
    </section>
  );
}
