## AstraBuilder

AstroBuilder is a Next.js application for browsing cards and building decks for **Echoes of Astra**. It uses the official Astra API for live card data while keeping Supabase for app-specific features such as auth and saved decks.

## Development

### Prerequisites

- Node.js 18+
- pnpm / npm / yarn / bun (project currently uses npm with a lockfile)

### Environment variables

Create a `.env.local` file in the project root with your Supabase app credentials when you want auth, profiles, and saved decks enabled:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Optional:

```env
ASTRA_API_BASE_URL=https://api.echoesofastra.com
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

Open <http://localhost:3000> to access the site.

`src/data/cards.json` is kept in the repo as a fallback snapshot when the Astra API is unavailable or returns no rows.

### Image optimization

Card artwork is served directly from the Echoes of Astra asset host. Next.js image optimization remains disabled via `next.config.ts` to avoid unnecessary transformation work in deployment.

The deck share image generator renders remote card art into a browser canvas. It uses a cacheable `/api/card-image` proxy so share exports can work even when the asset CDN does not return CORS headers. Normal card browsing still loads artwork directly from `assets.echoesofastra.com`.

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
