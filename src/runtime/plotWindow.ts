import type { PlotPayload } from "../types";

const PLOT_WINDOW_NAME = "pulseq_plots";

const plotShell = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>pypulseq — Plots</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: system-ui, -apple-system, sans-serif;
        background: #0f1117;
        color: #e2dfd8;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: #0f1117;
      }
      main {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.5rem 1.25rem 3rem;
      }
      h1 {
        margin: 0 0 1rem;
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #8a8697;
      }
      .empty {
        padding: 1rem 1.2rem;
        border: 1px dashed rgba(255, 255, 255, 0.12);
        color: #5c586a;
        font-size: 0.9rem;
      }
      .figure {
        margin: 0 0 1.5rem;
        padding: 1rem;
        background: #161822;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 4px;
      }
      .figure h2 {
        margin: 0 0 0.75rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: #e2dfd8;
      }
      .figure img, .figure svg {
        display: block;
        max-width: 100%;
        height: auto;
        background: #fff;
        border-radius: 2px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>pypulseq — Plots</h1>
      <div id="plots" class="empty"></div>
    </main>
  </body>
</html>`;

function getPlotsRoot(plotWindow: Window): HTMLElement {
  const root = plotWindow.document.getElementById("plots");
  if (!root) {
    throw new Error("Plot window is missing its root container.");
  }
  return root;
}

export function openOrReusePlotWindow(): Window | null {
  const plotWindow = window.open("", PLOT_WINDOW_NAME);
  if (!plotWindow) {
    return null;
  }

  if (plotWindow.document.readyState === "complete" && plotWindow.document.getElementById("plots")) {
    return plotWindow;
  }

  plotWindow.document.open();
  plotWindow.document.write(plotShell);
  plotWindow.document.close();
  return plotWindow;
}

export function clearPlotWindow(plotWindow: Window) {
  const root = getPlotsRoot(plotWindow);
  root.className = "empty";
  root.textContent = "No plots rendered for this run.";
}

export function clearExistingPlotWindow(plotWindow: Window | null) {
  if (!plotWindow || plotWindow.closed) {
    return;
  }
  clearPlotWindow(plotWindow);
}

export function appendPlot(plotWindow: Window, payload: PlotPayload) {
  const root = getPlotsRoot(plotWindow);
  root.className = "";

  if (root.childNodes.length === 1 && root.textContent === "No plots rendered for this run.") {
    root.textContent = "";
  }

  const section = plotWindow.document.createElement("section");
  section.className = "figure";

  const heading = plotWindow.document.createElement("h2");
  heading.textContent = payload.title || `Figure ${payload.figureIndex + 1}`;
  section.appendChild(heading);

  if (payload.mime === "image/svg+xml") {
    const container = plotWindow.document.createElement("div");
    container.innerHTML = payload.data;
    section.appendChild(container);
  } else {
    const image = plotWindow.document.createElement("img");
    image.alt = heading.textContent;
    image.src = `data:${payload.mime};base64,${payload.data}`;
    section.appendChild(image);
  }

  root.appendChild(section);
}
