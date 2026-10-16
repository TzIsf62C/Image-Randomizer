# Language Learning Image Shuffle

Offline-first Progressive Web App for spontaneous language practice using randomized image prompts.

## Features

- React + TypeScript + Vite PWA
- Offline support with service worker caching
- Set selection with persistent settings
- Unlimited slot configuration (add, delete, reorder)
- Category eligibility counts with validation
- Three repeat-avoidance modes:
  - Random
  - No repeats until all used
  - Avoid seen in last N spins
- Session-only history modal with image thumbnails
- Template save/load/rename/delete
- Keyboard shortcuts:
  - `Space`: spin
  - `H`: history
  - `S`: settings
  - `Esc`: close dialogs
- Landscape-oriented mobile practice mode

## Project Structure

- `src/`: React app source
- `public/images/mp1`, `public/images/mp2`: SVG assets
- `public/metadata/images.json`: image metadata records
- `public/metadata/taxonomy.json`: built-in sets and categories (stable ids + default names)

## Adding Built-in Sets and Categories

Built-in sets and categories have stable ids that users never see. Users can rename or delete them (deleting only hides them) and restore the defaults later.

1. Add `{ "id": "my-new-set", "name": "My New Set" }` to `sets` (or `categories`) in `public/metadata/taxonomy.json`. Ids are lowercase slugs and must never change once released.
2. Reference the id from images in `images.json`: `categories` lists category ids, and a set is given by `setIds`, or by `setName` whose slug equals the set id.
3. Run `npm test`; it fails if an image references an id missing from `taxonomy.json`.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## Deploy To GitHub Pages

```bash
npm run deploy
```

The app is configured with `base: './'` for static hosting.
