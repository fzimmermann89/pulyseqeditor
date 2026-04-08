import traceback
import sys
from pathlib import Path

from matplotlib import pyplot as plt


def reset_run_state(state):
    state["show_called"] = False
    plt.close("all")


def execute_user_code(code, namespace, state, export_open_figures):
    try:
        exec(code, namespace, namespace)
        if not state.get("show_called", False):
            export_open_figures()
    except Exception:
        traceback.print_exc()


def execute_script_file(script_path, argv, namespace, state, export_open_figures):
    previous_argv = sys.argv[:]
    try:
        sys.argv = list(argv)
        code = Path(script_path).read_text(encoding="utf8")
        execute_user_code(code, namespace, state, export_open_figures)
    finally:
        sys.argv = previous_argv
