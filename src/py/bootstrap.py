import sys
if "/app" not in sys.path:
    sys.path.insert(0, "/app")

from pypulseq_runtime.web_bootstrap import install_web_runtime


install_web_runtime(globals())
