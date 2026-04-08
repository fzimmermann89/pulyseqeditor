import type { DownloadPayload, LogPayload, PlotPayload } from "../types";
import { triggerDownload } from "./download";
import { appendPlot, clearExistingPlotWindow, openOrReusePlotWindow } from "./plotWindow";

type BridgeHandlers = {
  onLog: (payload: LogPayload) => void;
};

let activePlotWindow: Window | null = null;
let handlers: BridgeHandlers | null = null;

export function resetPlotWindow() {
  clearExistingPlotWindow(activePlotWindow);
}

export function installBridge(nextHandlers: BridgeHandlers) {
  handlers = nextHandlers;
}

export function dispatchLog(payload: LogPayload) {
  handlers?.onLog(payload);
}

export function dispatchPlot(payload: PlotPayload) {
  if (!activePlotWindow || activePlotWindow.closed) {
    activePlotWindow = openOrReusePlotWindow();
  }

  if (!activePlotWindow) {
    console.warn("Popup blocked while trying to render plot output.");
    return;
  }

  const plotsEl = activePlotWindow.document.getElementById("plots");
  if (plotsEl?.textContent === "No plots rendered for this run.") {
    plotsEl.textContent = "";
  }

  appendPlot(activePlotWindow, payload);
  activePlotWindow.focus();
}

export function dispatchDownload(payload: DownloadPayload) {
  triggerDownload(payload);
}
