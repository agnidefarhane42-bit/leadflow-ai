"use client";

import Link from "next/link";
import { Zap, Menu, X, Coins, LogOut, User } from "lucide-react";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ email: string; fullName: string | null } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          setBalance(data.balance);
        }
      })
      .catch(() => {});
  }, [pathname]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setBalance(null);
    router.push("/");
    router.refresh();
  };

  // Check if on auth pages (simpler navbar)
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  if (isAuthPage) return null;

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
            {user && (
              <>
                <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">
                  Dashboard
                </Link>
                <Link href="/agents" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">
                  Agents
                </Link>
              </>
            )}

            {user ? (
              <div className="flex items-center gap-3">
                {/* Credits badge */}
                <Link
                  href="/billing"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition"
                >
                  <Coins className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-bold text-amber-700">{balance ?? "..."}</span>
                </Link>

                {/* User menu */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold"
                  >
                    {user.fullName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2">
                      <div className="px-4 py-2 border-b border-slate-100">
                        <p className="text-sm font-medium text-slate-900 truncate">{user.fullName || user.email}</p>
                        <p className="text-xs text-slate-400 truncate">{user.email}</p>
                      </div>
                      <button
                        onClick={logout}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        Déconnexion
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">
                  Connexion
                </Link>
                <Link
                  href="/signup"
                  className="text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 px-5 py-2.5 rounded-lg hover:shadow-lg hover:shadow-brand-500/25 transition-all"
                >
                  Essayer gratuitement
                </Link>
              </>
            )}
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
          {user ? (
            <>
              <Link href="/dashboard" className="block text-sm font-medium text-slate-600" onClick={() => setOpen(false)}>
                Dashboard
              </Link>
              <Link href="/agents" className="block text-sm font-medium text-slate-600" onClick={() => setOpen(false)}>
                Agents IA
              </Link>
              <Link href="/billing" className="block text-sm font-medium text-slate-600" onClick={() => setOpen(false)}>
                Crédits: {balance ?? "..."}
              </Link>
              <button onClick={logout} className="block text-sm font-medium text-red-600">
                Déconnexion
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="block text-sm font-medium text-slate-600" onClick={() => setOpen(false)}>
                Connexion
              </Link>
              <Link href="/signup" className="block text-sm font-semibold text-white bg-gradient-to-r from-brand-500 to-purple-600 px-5 py-2.5 rounded-lg text-center" onClick={() => setOpen(false)}>
                Essayer gratuitement
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
