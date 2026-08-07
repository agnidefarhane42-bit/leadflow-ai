import { Search, Mail, Repeat, Target, Linkedin, MessageSquareReply, Coins } from "lucide-react";

const agents = [
  {
    icon: Search,
    title: "Lead Finder",
    description: "Trouve des prospects ciblés selon l'industrie, la taille d'entreprise, la localisation et le rôle. Bâtissez une liste qualifiée en minutes.",
    cost: "5 crédits",
  },
  {
    icon: Mail,
    title: "Cold Email Writer",
    description: "Génère des emails de prospection personnalisés et optimisés pour chaque prospect. Augmente votre taux de réponse.",
    cost: "2 crédits",
  },
  {
    icon: Repeat,
    title: "Follow-up Sequencer",
    description: "Crée des séquences de relance automatiques (3-5 emails) avec des angles différents pour maximiser la conversion.",
    cost: "8 crédits",
  },
  {
    icon: Target,
    title: "Prospect Qualifier",
    description: "Analyse et score vos prospects (hot, warm, cold) selon leur fit avec votre offre. Priorisez les meilleurs leads.",
    cost: "3 crédits",
  },
  {
    icon: Linkedin,
    title: "LinkedIn Outreach",
    description: "Génère des messages LinkedIn personnalisés pour le social selling. Connexion, suivi et value proposition.",
    cost: "2 crédits",
  },
  {
    icon: MessageSquareReply,
    title: "Reply Handler",
    description: "Analyse les réponses de vos prospects, les catégorise (intéressé, pas intéressé, out of office) et suggère la suite.",
    cost: "1 crédit",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            6 agents IA pour <span className="gradient-text">tout votre prospecting</span>
          </h2>
          <p className="text-lg text-slate-600">
            Chaque agent est spécialisé dans une tâche de prospection. Utilisez-les ensemble ou séparément.
            Vous ne payez que ce que vous utilisez.
          </p>
        </div>

        {/* Agents grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {agents.map((agent, i) => (
            <div
              key={i}
              className="group p-8 rounded-2xl bg-white border border-slate-100 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/5 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-purple-50 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <agent.icon className="w-6 h-6 text-brand-500" />
              </div>
              <h3 className="text-lg font-bold mb-2">{agent.title}</h3>
              <p className="text-sm text-slate-500 mb-4">{agent.description}</p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                <Coins className="w-3.5 h-3.5" />
                {agent.cost}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
