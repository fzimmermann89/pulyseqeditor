import builtins
import importlib
import io
from pathlib import Path

from .host import HostBridge

write_seq_module = importlib.import_module("pypulseq.Sequence.write_seq")
from pypulseq.Sequence.sequence import Sequence


def serialize_sequence_to_text(sequence, filename, create_signature=False, remove_duplicates=True):
    target = Path(filename)
    if target.suffix != ".seq":
        target = target.with_suffix(target.suffix + ".seq")

    captured = {}
    original_open = getattr(write_seq_module, "open", builtins.open)

    class CaptureFile(io.StringIO):
        def __init__(self):
            super().__init__()
            self.buffer = ""

        def close(self):
            self.buffer = self.getvalue()
            super().close()

    def open_proxy(path, mode="r", *args, **kwargs):
        path_str = str(path)
        if Path(path_str) == target and mode in {"w", "a", "r"}:
            if mode == "w":
                captured["writer"] = CaptureFile()
                return captured["writer"]
            if mode == "a":
                existing_text = captured.get("writer").buffer if captured.get("writer") else ""
                writer = CaptureFile()
                writer.write(existing_text)
                captured["writer"] = writer
                return writer
            if mode == "r":
                return io.StringIO(captured.get("writer").buffer if captured.get("writer") else "")
        return original_open(path, mode, *args, **kwargs)

    write_seq_module.open = open_proxy
    try:
        md5 = write_seq_module.write(sequence, target, create_signature, remove_duplicates)
    finally:
        write_seq_module.open = original_open

    text = captured.get("writer").buffer if captured.get("writer") else ""
    return target.name, text, md5


def install_sequence_write(host: HostBridge):
    def patched_sequence_write(self, file_name, create_signature=False, remove_duplicates=True):
        filename, content, md5 = serialize_sequence_to_text(
            self,
            file_name,
            create_signature=create_signature,
            remove_duplicates=remove_duplicates,
        )
        host.write_seq(filename, content, mime="text/plain")
        return md5

    Sequence.write = patched_sequence_write
