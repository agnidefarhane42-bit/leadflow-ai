import { Zap, Twitter, Linkedin, Mail } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 py-12 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" fill="white" />
              </div>
              <span className="text-lg font-bold">LeadFlow<span className="gradient-text"> AI</span></span>
            </div>
            <p className="text-slate-500 max-w-md">
              L'agent IA qui qualifie vos leads B2B et prend vos rendez-vous automatiquement.
              Conçu pour les PME et les développeurs.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Produit</h4>
            <ul className="space-y-2 text-sm text-slate-500">
              <li><a href="#features" className="hover:text-brand-600 transition">Fonctionnalités</a></li>
              <li><a href="#pricing" className="hover:text-brand-600 transition">Tarifs</a></li>
              <li><a href="/dashboard" className="hover:text-brand-600 transition">Dashboard</a></li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-3">Suivez-nous</h4>
            <div className="flex gap-3">
              <a href="#" className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="mailto:contact@leadflow.ai" className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition">
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-100 text-center text-sm text-slate-400">
          © 2026 LeadFlow AI. Fait avec ❤️ au Bénin.
        </div>
      </div>
    </footer>
  );
}
