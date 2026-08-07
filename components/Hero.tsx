import Link from "next/link";
import { ArrowRight, Sparkles, CheckCircle, TrendingUp, Bot, Coins } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-0 left-1/4 w-72 h-72 bg-brand-400/20 rounded-full blur-3xl blob" />
      <div className="absolute top-20 right-1/4 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl blob" style={{ animationDelay: "2s" }} />
      <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-pink-400/10 rounded-full blur-3xl blob" style={{ animationDelay: "4s" }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-200 mb-6">
            <Sparkles className="w-4 h-4 text-brand-500" />
            <span className="text-sm font-medium text-brand-700">Agents IA de prospecting — Pensé pour l'Afrique</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6">
            Automatisez votre prospecting.
            <br />
            <span className="gradient-text">Avec des agents IA qui travaillent pour vous.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto mb-10">
            Trouvez des prospects, écrivez vos emails, qualifiez vos leads et relancez automatiquement.
            6 agents IA prêts à l'emploi. Payez à l'usage, sans abonnement.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold text-lg hover:shadow-xl hover:shadow-brand-500/30 transition-all"
            >
              Démarrer avec 10 crédits gratuits
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/#features"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-lg hover:border-brand-300 hover:text-brand-600 transition-all"
            >
              Voir les agents
            </Link>
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-10 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Sans carte bancaire
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Sans abonnement
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Annulable à tout moment
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 max-w-4xl mx-auto">
          {[
            { icon: Bot, value: "6", label: "agents IA spécialisés" },
            { icon: TrendingUp, value: "3x", label: "plus de prospects qualifiés" },
            { icon: Coins, value: "0€", label: "abonnement — payez à l'usage" },
          ].map((stat, i) => (
            <div key={i} className="glass-card rounded-2xl p-6 text-center glow">
              <stat.icon className="w-8 h-8 mx-auto mb-3 text-brand-500" />
              <div className="text-3xl font-bold gradient-text">{stat.value}</div>
              <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
