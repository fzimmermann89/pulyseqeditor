import base64
import sys
from pathlib import Path

from .host import HostBridge


class FilesystemHost(HostBridge):
    def __init__(self, output_dir):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def log(self, stream, text):
        target = sys.__stdout__
        if stream == "stderr":
            target = sys.__stderr__
        target.write(text)
        target.flush()

    def emit_plot(self, figure_index, title, mime, data):
        del title
        if mime != "image/png":
            raise ValueError(f"FilesystemHost only supports PNG plots, got {mime}")

        payload = base64.b64decode(data.encode("ascii"))
        output_path = self.output_dir / f"figure{figure_index + 1}.png"
        output_path.write_bytes(payload)

    def write_seq(self, filename, content, mime="text/plain"):
        del mime
        output_path = self.output_dir / filename
        output_path.write_text(content, encoding="utf8")

    def preferred_plot_format(self):
        return "png"
