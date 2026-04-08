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
    previous_file = namespace.get("__file__")
    previous_sys_path = sys.path[:]
    script_path = Path(script_path).resolve()
    try:
        sys.argv = list(argv)
        namespace["__file__"] = str(script_path)
        script_dir = str(script_path.parent)
        if sys.path:
            sys.path[0] = script_dir
        else:
            sys.path.insert(0, script_dir)
        code = script_path.read_text(encoding="utf8")
        execute_user_code(code, namespace, state, export_open_figures)
    finally:
        sys.argv = previous_argv
        sys.path[:] = previous_sys_path
        if previous_file is None:
            namespace.pop("__file__", None)
        else:
            namespace["__file__"] = previous_file
