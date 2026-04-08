# pulseq editor

Tools for running `pypulseq` code with Pyodide in the browser and on Windows.

Live app:  
https://fzimmermann89.github.io/pulyseqeditor/

Upstream `pypulseq`:  
https://github.com/imr-framework/pypulseq

## Outputs

- Web app
  Runs Python in the browser with Pyodide, shows `matplotlib` plots in a separate plot window, and intercepts `Sequence.write(...)` for browser downloads.
- `pypulseq-cli.exe`
  Runs a Python script with embedded Pyodide on Windows. `matplotlib` figures are written as `figure1.png`, `figure2.png`, ... and `.seq` files are written to disk.
- `pypulseq-gui.exe`
  Runs the same editor UI in a native Windows window using WebView2.

## Build

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

Build the native asset bundle used by the Windows binaries:

```bash
npm run build:native-assets
```

Build the Rust native binaries:

```bash
cd native
cargo build --release -p pypulseq-cli -p pypulseq-gui
```

## Use

Web app:

```bash
npm run dev
```

Preview the production build locally:

```bash
npm run preview
```

CLI:

```bash
pypulseq-cli script.py
```

Optional flags:

- `--output-dir DIR`
- `--copy PATH`
- `--verbose`

GUI:

```bash
pypulseq-gui
```

The native GUI uses the embedded frontend assets and requires an installed WebView2 runtime on Windows.
