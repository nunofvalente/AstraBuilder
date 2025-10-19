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

Open <http://localhost:3000> to access the site.

### Generating card data

Use the helper script to export all cards from Supabase into `src/data/cards.json`:

```bash
npm run generate:cards
```

The JSON acts as a fallback when Supabase is unavailable or returns no rows.

### Image optimization

For Supabase-hosted assets the project uses the raw image URLs (Next.js image optimization is disabled via `next.config.ts` to stay within Vercel's free transformation quota). Ensure your card images are pre-sized to roughly `240x336` for best results.

### Generating card images

Use the helper script to resize and upload the `small`, `medium`, and `large` WebP variants for every card stored in the Supabase bucket:

```bash
node scripts/generate-card-images.mjs
```

The script requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (either exported in your shell or defined in `.env`). Optional environment toggles:

- `CARD_SKIP_EXISTING=true` - only uploads variants that are missing in storage.
- `CARD_ID_FILTER=card-id-a,card-id-b` - limits processing to specific card IDs (matches the `cards` table primary key).
- `CARD_OBJECT_FILTER=subfolder-or-file-fragment` - filters by storage path substring, useful when you know the storage key.
- `CARD_VARIANTS=small,large` - restricts the generated sizes.

Combine filters as needed, e.g. export `CARD_SKIP_EXISTING=true` and `CARD_ID_FILTER=1234` to regenerate assets for a single card without touching the rest.

### Updating cache headers

After uploading images, refresh the storage metadata so CDN clients respect the intended caching policy:

```bash
node scripts/set-storage-cache-control.mjs --bucket cards --seconds 31536000
```

The script reads `SUPABASE_URL` (falling back to `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`. Optional knobs mirror the image generator:

- `CARD_ID_FILTER=card-id-a` - limits cache updates to a card's original and variant files in the specified bucket.
- `CARD_OBJECT_FILTER=folder-or-file` - only updates objects whose path contains the fragment.
- `CARD_VARIANTS=small,large` - restricts the variant subfolders considered when `CARD_ID_FILTER` is set.
- Add `--prefix foo/bar` to the command if you already know the exact subdirectory to touch.

Combine filters as needed (for example, export `CARD_ID_FILTER=1ee8f8e9-48b8-4a1a-887d-50c2ee1aabe5` before running the command to touch just that card's assets).

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
