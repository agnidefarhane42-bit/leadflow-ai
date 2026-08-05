"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle, Loader2, Sparkles, Calendar } from "lucide-react";

const questions = [
  {
    key: "budget",
    label: "Quel est votre budget pour ce projet ?",
    options: [
      { value: "< 500€", score: 10 },
      { value: "500€ - 2000€", score: 25 },
      { value: "2000€ - 5000€", score: 40 },
      { value: "> 5000€", score: 50 },
    ],
  },
  {
    key: "need",
    label: "Quel est votre besoin principal ?",
    options: [
      { value: "Site web / Landing page", score: 15 },
      { value: "Automatisation / IA", score: 30 },
      { value: "Lead generation", score: 35 },
      { value: "Développement complet", score: 40 },
    ],
  },
  {
    key: "timeline",
    label: "Dans quels délais souhaitez-vous démarrer ?",
    options: [
      { value: "Immédiatement", score: 30 },
      { value: "1-2 semaines", score: 25 },
      { value: "1 mois", score: 15 },
      { value: "Plus tard", score: 5 },
    ],
  },
  {
    key: "role",
    label: "Êtes-vous décisionnaire ?",
    options: [
      { value: "Oui, je décide", score: 25 },
      { value: "Je valide avec un associé", score: 15 },
      { value: "Je recommande", score: 5 },
    ],
  },
];

const MAX_SCORE = 170;

export default function QualifyPage() {
  const [step, setStep] = useState(0); // 0 = info, 1-4 = questions, 5 = scoring, 6 = result, 7 = booking
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
  });
  const [answers, setAnswers] = useState<Record<string, { value: string; score: number }>>({});
  const [leadId, setLeadId] = useState<number | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [leadStatus, setLeadStatus] = useState("");
  const [slots, setSlots] = useState<{ date: string; time: string; datetime: string }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(1);
  };

  const handleAnswer = (key: string, value: string, score: number) => {
    const newAnswers = { ...answers, [key]: { value, score } };
    setAnswers(newAnswers);
    if (step < questions.length) {
      setStep(step + 1);
    } else {
      submitLead(newAnswers);
    }
  };

  const submitLead = async (allAnswers: Record<string, { value: string; score: number }>) => {
    setLoading(true);
    setStep(questions.length + 1);

    const answersObj: Record<string, string> = {};
    Object.entries(allAnswers).forEach(([k, v]) => { answersObj[k] = v.value; });

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          source: "landing",
          answers: answersObj,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setTotalScore(data.lead.score);
        setLeadStatus(data.lead.status);
        setLeadId(data.lead.id);
        setLoading(false);
        setStep(questions.length + 2);
      } else {
        setLoading(false);
        alert("Une erreur est survenue. Réessayez.");
      }
    } catch (err) {
      setLoading(false);
      alert("Erreur de connexion. Réessayez.");
    }
  };

  const fetchSlots = async () => {
    const res = await fetch(`/api/appointments?leadId=${leadId}`);
    const data = await res.json();
    setSlots(data.slots || []);
    setStep(questions.length + 3);
  };

  const bookAppointment = async () => {
    if (!selectedSlot) return;
    setLoading(true);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, datetime: selectedSlot, duration: 30 }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.success) {
      setBookingConfirmed(true);
    }
  };

  const getStatusInfo = (status: string) => {
    if (status === "hot") return { label: "Lead Hot 🔥", color: "text-red-500", bg: "bg-red-50", message: "On vous contacte immédiatement pour planifier un RDV !" };
    if (status === "warm") return { label: "Lead Warm ⚡", color: "text-amber-500", bg: "bg-amber-50", message: "On vous recontacte sous 48h." };
    return { label: "Lead Cold ❄️", color: "text-blue-500", bg: "bg-blue-50", message: "On garde votre contact pour plus tard." };
  };

  // Info step
  if (step === 0) {
    return (
      <div className="min-h-screen pt-24 pb-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-200 mb-4">
              <Sparkles className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-medium text-brand-700">Qualification gratuite en 2 minutes</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">Parlons de votre projet</h1>
            <p className="text-slate-600">Remplissez ce formulaire, notre IA va qualifier votre demande en temps réel.</p>
          </div>

          <form onSubmit={handleInfoSubmit} className="glass-card rounded-2xl p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom complet *</label>
              <input type="text" required value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="Jean Dupont" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
              <input type="email" required value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="jean@entreprise.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Entreprise</label>
              <input type="text" value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="Mon Entreprise SARL" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Téléphone</label>
              <input type="tel" value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition"
                placeholder="+229 XX XX XX XX" />
            </div>
            <button type="submit"
              className="w-full py-4 rounded-xl bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold text-lg hover:shadow-xl hover:shadow-brand-500/30 transition-all flex items-center justify-center gap-2">
              Continuer <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Questions step
  if (step <= questions.length) {
    const q = questions[step - 1];
    return (
      <div className="min-h-screen pt-24 pb-12 px-4 flex items-center">
        <div className="max-w-2xl mx-auto w-full">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-500">Question {step} sur {questions.length}</span>
              <span className="text-sm font-medium text-brand-500">{Math.round((step / questions.length) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-purple-600 transition-all duration-500"
                style={{ width: `${(step / questions.length) * 100}%` }} />
            </div>
          </div>
          <div className="glass-card rounded-2xl p-8">
            <h2 className="text-2xl font-bold mb-6">{q.label}</h2>
            <div className="space-y-3">
              {q.options.map((opt, i) => (
                <button key={i} onClick={() => handleAnswer(q.key, opt.value, opt.score)}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-brand-400 hover:bg-brand-50 transition-all flex items-center justify-between group">
                  <span className="font-medium text-slate-700 group-hover:text-brand-700">{opt.value}</span>
                  <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Scoring step
  if (loading || step === questions.length + 1) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 text-brand-500 animate-spin" />
          <p className="text-lg font-medium text-slate-600">Notre IA analyse vos réponses...</p>
        </div>
      </div>
    );
  }

  // Booking confirmed
  if (bookingConfirmed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-lg">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold mb-3">RDV confirmé ! 🎉</h1>
          <p className="text-slate-600 mb-4">Votre rendez-vous est programmé. Un email de confirmation vous a été envoyé.</p>
          <p className="text-sm text-slate-400">On vous contactera au créneau choisi. À très vite !</p>
        </div>
      </div>
    );
  }

  // Booking step
  if (step === questions.length + 3) {
    return (
      <div className="min-h-screen pt-24 pb-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-brand-500" />
            <h1 className="text-3xl font-bold mb-2">Choisissez un créneau</h1>
            <p className="text-slate-600">Sélectionnez l'horaire qui vous convient pour votre RDV.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {slots.map((slot, i) => (
              <button key={i} onClick={() => setSelectedSlot(slot.datetime)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  selectedSlot === slot.datetime
                    ? "border-brand-500 bg-brand-50"
                    : "border-slate-200 hover:border-brand-300"
                }`}>
                <div className="font-semibold capitalize">{slot.date}</div>
                <div className="text-brand-600 font-medium">{slot.time}</div>
              </button>
            ))}
          </div>

          {selectedSlot && (
            <button onClick={bookAppointment} disabled={loading}
              className="w-full mt-6 py-4 rounded-xl bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold text-lg hover:shadow-xl hover:shadow-brand-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              {loading ? "Réservation..." : "Confirmer le RDV"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Result step
  const status = getStatusInfo(leadStatus);
  const canBook = leadStatus === "hot" || leadStatus === "warm";

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 flex items-center">
      <div className="max-w-2xl mx-auto w-full text-center">
        <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-full ${status.bg} mb-6`}>
          <CheckCircle className={`w-5 h-5 ${status.color}`} />
          <span className={`text-lg font-bold ${status.color}`}>{status.label}</span>
        </div>

        <h1 className="text-4xl font-bold mb-4">Merci {formData.name.split(" ")[0]} ! 🎉</h1>
        <p className="text-lg text-slate-600 mb-8">{status.message}</p>

        <div className="glass-card rounded-2xl p-8 mb-8">
          <p className="text-sm font-medium text-slate-500 mb-2">Votre score de qualification</p>
          <div className="text-6xl font-extrabold gradient-text mb-3">{totalScore}<span className="text-2xl text-slate-400">/{MAX_SCORE}</span></div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-3 rounded-full bg-gradient-to-r from-brand-500 to-purple-600 transition-all duration-1000"
              style={{ width: `${Math.min((totalScore / MAX_SCORE) * 100, 100)}%` }} />
          </div>
        </div>

        {canBook && (
          <button onClick={fetchSlots}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-brand-500 to-purple-600 text-white font-semibold text-lg hover:shadow-xl hover:shadow-brand-500/30 transition-all">
            <Calendar className="w-5 h-5" />
            Réserver un RDV maintenant
          </button>
        )}

        <p className="text-slate-500 mt-6">
          Un email de confirmation a été envoyé à <span className="font-semibold text-slate-700">{formData.email}</span>
        </p>
      </div>
    </div>
  );
}
