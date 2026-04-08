export type LogStream = "stdout" | "stderr" | "info";

export type LogPayload = {
  stream: LogStream;
  text: string;
};

export type PlotPayload = {
  figureIndex: number;
  title: string;
  mime: "image/svg+xml" | "image/png";
  data: string;
};

export type DownloadPayload = {
  filename: string;
  content: string;
  mime?: string;
};

export type ConsoleEntry = LogPayload & {
  id: string;
};
