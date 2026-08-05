import { Brain, Target, Calendar, Bell, BarChart, Shield } from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Qualification IA",
    description: "Notre agent IA analyse chaque réponse et calcule un score de qualification en temps réel. Hot, warm ou cold — vous savez immédiatement qui contacter.",
  },
  {
    icon: Target,
    title: "Scoring intelligent",
    description: "Budget, besoin, timeline, décisionnaire — chaque critère est pondéré pour vous donner un score précis. Fini les leads qui ne convertissent pas.",
  },
  {
    icon: Calendar,
    title: "Booking automatique",
    description: "Les leads qualifiés reçoivent directement des créneaux Google Calendar. Le RDV se planifie tout seul, vous n'avez qu'à être présent.",
  },
  {
    icon: Bell,
    title: "Notifications temps réel",
    description: "Un lead chaud entre ? Vous êtes alerté immédiatement par email. Ne laissez plus passer une opportunité par manque de réactivité.",
  },
  {
    icon: BarChart,
    title: "Dashboard clair",
    description: "Visualisez tous vos leads, leurs scores, les RDVs pris et votre taux de conversion dans un dashboard simple et épuré.",
  },
  {
    icon: Shield,
    title: "Multi-canal",
    description: "Vos leads arrivent de LinkedIn, Twitter ou votre landing page ? Tout est centralisé et qualifié au même endroit.",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Tout ce qu'il faut pour <span className="gradient-text">convertir</span>
          </h2>
          <p className="text-lg text-slate-600">
            Un outil pensé pour les PME B2B et les développeurs qui veulent du résultat, pas de la complexité.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, i) => (
            <div
              key={i}
              className="group p-8 rounded-2xl bg-white border border-slate-100 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/5 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <feature.icon className="w-6 h-6 text-brand-500" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-slate-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
