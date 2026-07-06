# Language Learning Slot Machine

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
