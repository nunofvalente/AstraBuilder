## AstraBuilder

AstroBuilder is a Next.js application for browsing cards and building decks for **Echoes of Astra**. It integrates with Supabase for live card data while providing flexible local development helpers.

## Development

### Prerequisites

- Node.js 18+
- pnpm / npm / yarn / bun (project currently uses npm with a lockfile)
- Supabase project with a `cards` table shaped according to `scripts/generate-card-data.mjs`

### Environment variables

Create a `.env.local` file in the project root with at least:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

When you need to work offline or avoid hitting the Supabase quota, enable the local fixture by setting:

```env
NEXT_PUBLIC_USE_DEV_CARDS=true
```

With this flag the deck builder serves `src/data/cards-dev.json`, which ships with one sample card per affinity and gradient placeholder art in `public/images/dev-cards/`. Set the flag to `false` (or remove it) to restore Supabase-backed data.

### Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the site.

### Generating card data

Use the helper script to export all cards from Supabase into `src/data/cards.json`:

```bash
npm run generate:cards
```

The JSON acts as a fallback when Supabase is unavailable or returns no rows.

### Image optimization

For Supabase-hosted assets the project uses the raw image URLs (Next.js image optimization is disabled via `next.config.ts` to stay within Vercel’s free transformation quota). Ensure your card images are pre-sized to roughly `240x336` for best results.

### Linting and type-checking

```bash
npm run lint
npm run type-check
```

### Testing

```bash
npm test
```

## Deployment

The project targets Vercel. Configure the production branch (typically `main`) and environment variables in the Vercel dashboard. Preview deployments can be triggered manually if automatic deploys are disabled.
