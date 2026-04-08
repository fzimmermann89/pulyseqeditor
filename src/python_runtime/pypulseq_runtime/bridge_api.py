import sys

from .host import HostBridge


class BridgeWriter:
    def __init__(self, host: HostBridge, stream_name):
        self.host = host
        self.stream_name = stream_name

    def write(self, text):
        if text:
            self.host.log(self.stream_name, str(text))
        return len(text)

    def flush(self):
        return None


def install_stdio(host: HostBridge):
    sys.stdout = BridgeWriter(host, "stdout")
    sys.stderr = BridgeWriter(host, "stderr")
