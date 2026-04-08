import base64
import builtins
import contextlib
import importlib
import io
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

from matplotlib import pyplot as plt
from pyodide.ffi import to_js

write_seq_module = importlib.import_module("pypulseq.Sequence.write_seq")
from pypulseq.Sequence.sequence import Sequence


_pybridge = __import__("js").__pybridge


_pybridge_state = globals().get("_pybridge_state", {"show_called": False})
globals()["_pybridge_state"] = _pybridge_state


class _BridgeWriter:
    def __init__(self, stream_name):
        self.stream_name = stream_name

    def write(self, text):
        if text:
            _pybridge.log(to_js({"stream": self.stream_name, "text": str(text)}))
        return len(text)

    def flush(self):
        return None


sys.stdout = _BridgeWriter("stdout")
sys.stderr = _BridgeWriter("stderr")


def _figure_title(figure, index):
    with contextlib.suppress(Exception):
        title = figure._suptitle.get_text() if figure._suptitle else ""
        if title:
            return title
    axes = figure.get_axes()
    if axes:
        with contextlib.suppress(Exception):
            axis_title = axes[0].get_title()
            if axis_title:
                return axis_title
    return f"Figure {index + 1}"


def _export_open_figures(*_args, **_kwargs):
    figure_numbers = list(plt.get_fignums())
    if not figure_numbers:
        return

    _pybridge_state["show_called"] = True

    for figure_index, figure_number in enumerate(figure_numbers):
        figure = plt.figure(figure_number)
        title = _figure_title(figure, figure_index)

        svg_buffer = io.StringIO()
        try:
            figure.savefig(svg_buffer, format="svg", bbox_inches="tight")
            _pybridge.openPlot(
                to_js(
                    {
                        "figureIndex": figure_index,
                        "title": title,
                        "mime": "image/svg+xml",
                        "data": svg_buffer.getvalue(),
                    }
                )
            )
            continue
        except Exception:
            pass

        png_buffer = io.BytesIO()
        figure.savefig(png_buffer, format="png", bbox_inches="tight")
        _pybridge.openPlot(
            to_js(
                {
                    "figureIndex": figure_index,
                    "title": title,
                    "mime": "image/png",
                    "data": base64.b64encode(png_buffer.getvalue()).decode("ascii"),
                }
            )
        )

    plt.close("all")


plt.show = _export_open_figures


def _serialize_sequence_to_text(sequence, filename, create_signature=False, remove_duplicates=True):
    target = Path(filename)
    if target.suffix != ".seq":
        target = target.with_suffix(target.suffix + ".seq")

    captured = {}
    original_open = getattr(write_seq_module, "open", builtins.open)

    class _CaptureFile(io.StringIO):
        def __init__(self):
            super().__init__()
            self.buffer = ""

        def close(self):
            self.buffer = self.getvalue()
            super().close()

    def _open_proxy(path, mode="r", *args, **kwargs):
        path_str = str(path)
        if Path(path_str) == target and mode in {"w", "a", "r"}:
            if mode == "w":
                captured["writer"] = _CaptureFile()
                return captured["writer"]
            if mode == "a":
                existing_text = captured.get("writer").buffer if captured.get("writer") else ""
                writer = _CaptureFile()
                writer.write(existing_text)
                captured["writer"] = writer
                return writer
            if mode == "r":
                return io.StringIO(captured.get("writer").buffer if captured.get("writer") else "")
        return original_open(path, mode, *args, **kwargs)

    write_seq_module.open = _open_proxy
    try:
        md5 = write_seq_module.write(sequence, target, create_signature, remove_duplicates)
    finally:
        write_seq_module.open = original_open

    text = captured.get("writer").buffer if captured.get("writer") else ""
    return target.name, text, md5


def _patched_sequence_write(self, file_name, create_signature=False, remove_duplicates=True):
    filename, content, md5 = _serialize_sequence_to_text(
        self,
        file_name,
        create_signature=create_signature,
        remove_duplicates=remove_duplicates,
    )
    _pybridge.downloadSeq(
        to_js({"filename": filename, "content": content, "mime": "text/plain"})
    )
    return md5


Sequence.write = _patched_sequence_write
