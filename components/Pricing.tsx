import { Check, Sparkles } from "lucide-react";

const plans = [
  {
    name: "Gratuit",
    price: "0",
    period: "/mois",
    description: "Pour tester et démarrer",
    features: [
      "10 leads par mois",
      "Formulaire de qualification",
      "Scoring IA basique",
      "Dashboard",
      "1 utilisateur",
    ],
    cta: "Commencer gratuitement",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "20",
    period: "/mois",
    description: "Pour scaler votre lead gen",
    features: [
      "Leads illimités",
      "Scoring IA avancé",
      "Booking Google Calendar",
      "Notifications temps réel",
      "Multi-canal (LinkedIn + Twitter)",
      "Statistiques avancées",
      "Support prioritaire",
    ],
    cta: "Passer au Pro",
    highlighted: true,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Des tarifs <span className="gradient-text">simples</span>
          </h2>
          <p className="text-lg text-slate-600">Commencez gratuitement, passez au Pro quand vous êtes prêt.</p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`relative p-8 rounded-3xl transition-all ${
                plan.highlighted
                  ? "bg-gradient-to-br from-brand-600 to-purple-700 text-white shadow-2xl shadow-brand-500/20 scale-105"
                  : "bg-white border border-slate-200"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-4 py-1 rounded-full bg-white text-brand-600 text-xs font-semibold">
                  <Sparkles className="w-3 h-3" /> Recommandé
                </div>
              )}

              <h3 className={`text-2xl font-bold mb-1 ${plan.highlighted ? "text-white" : "text-slate-900"}`}>
                {plan.name}
              </h3>
              <p className={`text-sm mb-6 ${plan.highlighted ? "text-brand-100" : "text-slate-500"}`}>
                {plan.description}
              </p>

              <div className="flex items-baseline gap-1 mb-8">
                <span className={`text-5xl font-extrabold ${plan.highlighted ? "text-white" : "text-slate-900"}`}>
                  {plan.price}€
                </span>
                <span className={`text-lg ${plan.highlighted ? "text-brand-200" : "text-slate-400"}`}>
                  {plan.period}
                </span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      plan.highlighted ? "bg-white/20" : "bg-emerald-50"
                    }`}>
                      <Check className={`w-3 h-3 ${plan.highlighted ? "text-white" : "text-emerald-500"}`} />
                    </div>
                    <span className={plan.highlighted ? "text-brand-50" : "text-slate-700"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
                  plan.highlighted
                    ? "bg-white text-brand-600 hover:bg-brand-50"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
