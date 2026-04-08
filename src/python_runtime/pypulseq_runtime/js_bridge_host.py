from pyodide.ffi import to_js

from .host import HostBridge


class JsBridgeHost(HostBridge):
    def __init__(self):
        self._pybridge = getattr(__import__("js"), "__pybridge")

    def log(self, stream, text):
        self._pybridge.log(to_js({"stream": stream, "text": text}))

    def emit_plot(self, figure_index, title, mime, data):
        self._pybridge.openPlot(
            to_js(
                {
                    "figureIndex": figure_index,
                    "title": title,
                    "mime": mime,
                    "data": data,
                }
            )
        )

    def write_seq(self, filename, content, mime="text/plain"):
        self._pybridge.downloadSeq(
            to_js({"filename": filename, "content": content, "mime": mime})
        )

    def preferred_plot_format(self):
        preferred = getattr(self._pybridge, "preferredPlotFormat", None)
        if preferred is None:
            return None
        return str(preferred())
