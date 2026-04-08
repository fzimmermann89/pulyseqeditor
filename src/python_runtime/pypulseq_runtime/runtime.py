from .bridge_api import install_stdio
from .patch_matplotlib import export_open_figures, install_show
from .patch_pypulseq import install_sequence_write


def install_runtime(host, namespace):
    state = namespace.get("_pybridge_state", {"show_called": False})
    namespace["_pybridge_state"] = state

    install_stdio(host)
    namespace["_export_open_figures"] = lambda *_args, **_kwargs: export_open_figures(host, state)
    install_show(host, state)
    install_sequence_write(host)
