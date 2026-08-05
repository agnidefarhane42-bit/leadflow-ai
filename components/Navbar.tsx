import Link from "next/link";
import { Zap, Menu, X } from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 glass-card border-b border-white/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" fill="white" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              LeadFlow<span className="gradient-text"> AI</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">
              Fonctionnalités
            </Link>
            <Link href="/#pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">
              Tarifs
            </Link>
            <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">
              Dashboard
            </Link>
            <Link
              href="/qualify"
              className="text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 px-5 py-2.5 rounded-lg hover:shadow-lg hover:shadow-brand-500/25 transition-all"
            >
              Essayer gratuitement
            </Link>
          </div>

          {/* Mobile button */}
          <button className="md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden glass-card border-t border-white/20 px-6 py-4 space-y-3">
          <Link href="/#features" className="block text-sm font-medium text-slate-600" onClick={() => setOpen(false)}>
            Fonctionnalités
          </Link>
          <Link href="/#pricing" className="block text-sm font-medium text-slate-600" onClick={() => setOpen(false)}>
            Tarifs
          </Link>
          <Link href="/dashboard" className="block text-sm font-medium text-slate-600" onClick={() => setOpen(false)}>
            Dashboard
          </Link>
          <Link href="/qualify" className="block text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 px-5 py-2.5 rounded-lg text-center" onClick={() => setOpen(false)}>
            Essayer gratuitement
          </Link>
        </div>
      )}
    </nav>
  );
}
