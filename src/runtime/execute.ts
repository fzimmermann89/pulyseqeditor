import { resetPlotWindow } from "./bridge";
import { executePython as workerExecute } from "./pyodide";

export async function executePython(code: string) {
  resetPlotWindow();
  await workerExecute(code);
}
