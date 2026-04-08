# pulseq editor

Browser-based editor for running `pypulseq` code with Pyodide.

Live app:  
https://fzimmermann89.github.io/pulyseqeditor/

Upstream `pypulseq`:  
https://github.com/imr-framework/pypulseq

## What it does

- runs Python in the browser with Pyodide
- loads `numpy`, `matplotlib`, `pypulseq`, etc
- renders `matplotlib` output in a separate plot window
- intercepts `Sequence.write(...)` and downloads `.seq` files directly in the browser

## Build and run

Requirements:

- Node.js
- `curl`
- `tar`
- `zip`

Install dependencies:

```bash
npm ci
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

