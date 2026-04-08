import json
import os
from pathlib import Path

from .execution import execute_script_file, reset_run_state
from .native_bootstrap import install_native_runtime


def run_native_script(
    script_path,
    script_args=None,
    output_dir=None,
    working_directory=None,
    namespace=None,
):
    namespace = namespace if namespace is not None else globals()
    script_path = Path(script_path).resolve()
    output_dir = Path(output_dir) if output_dir is not None else script_path.parent
    working_directory = (
        Path(working_directory) if working_directory is not None else script_path.parent
    )
    script_args = list(script_args or [])

    install_native_runtime(namespace=namespace)
    state = namespace["_pybridge_state"]
    export_open_figures = namespace["_export_open_figures"]
    reset_run_state(state)
    previous_cwd = Path.cwd()
    try:
        os.chdir(working_directory)
        execute_script_file(
            script_path=str(script_path),
            argv=[str(script_path), *script_args],
            namespace=namespace,
            state=state,
            export_open_figures=export_open_figures,
        )
    finally:
        os.chdir(previous_cwd)


def run_native_request_json(request_json, namespace=None):
    request = json.loads(request_json)
    run_native_script(
        script_path=request["scriptPath"],
        script_args=request.get("scriptArgs", []),
        output_dir=request.get("outputDir"),
        working_directory=request.get("workingDirectory"),
        namespace=namespace,
    )
