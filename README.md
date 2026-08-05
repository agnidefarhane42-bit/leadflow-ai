# LeadFlow AI 🚀

Agent IA de qualification de leads + prise de rendez-vous automatique pour les PME B2B et les développeurs.

## Stack technique

- **Frontend :** Next.js 14 (App Router) + Tailwind CSS
- **Database :** Neon PostgreSQL + Drizzle ORM
- **Icons :** Lucide React
- **Animations :** Framer Motion
- **Deployment :** Vercel

## Démarrage rapide

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Remplissez les variables :
- `DATABASE_URL` : votre connection string Neon
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` : pour le booking Calendar
- `RESEND_API_KEY` : pour les notifications email (optionnel)

### 3. Créer les tables

Exécutez le schéma SQL dans votre console Neon :

```bash
psql $DATABASE_URL -f schema.sql
```

Ou utilisez Drizzle Kit :

```bash
npm run db:push
```

### 4. Lancer le dev server

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000)

## Structure du projet

```
leadflow-ai/
├── app/
│   ├── layout.tsx          # Layout racine
│   ├── page.tsx            # Landing page
│   ├── globals.css         # Styles globaux
│   ├── qualify/            # Formulaire de qualification IA
│   │   └── page.tsx
│   └── dashboard/          # Dashboard PME
│       └── page.tsx
├── components/
│   ├── Navbar.tsx          # Navigation
│   ├── Hero.tsx            # Section hero
│   ├── Features.tsx        # Section fonctionnalités
│   ├── Pricing.tsx         # Section tarifs
│   └── Footer.tsx          # Footer
├── lib/
│   ├── db.ts               # Schema + connexion Neon
│   └── utils.ts            # Utilitaires
├── schema.sql              # Schéma SQL complet
├── drizzle.config.ts       # Config Drizzle ORM
└── package.json
```

## Fonctionnalités

- ✅ Landing page avec design moderne
- ✅ Formulaire de qualification IA (scoring en temps réel)
- ✅ Dashboard de gestion des leads
- 🔄 Booking automatique Google Calendar (à venir)
- 🔄 Notifications email temps réel (à venir)
- 🔄 Multi-canal LinkedIn + Twitter (à venir)

## Tarifs

- **Gratuit :** 10 leads/mois, scoring basique
- **Pro (20€/mois) :** Leads illimités, booking auto, notifications, multi-canal

## License

MIT — Fait avec ❤️ au Bénin
