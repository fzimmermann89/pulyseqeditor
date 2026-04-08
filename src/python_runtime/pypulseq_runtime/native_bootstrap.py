from .js_bridge_host import JsBridgeHost
from .runtime import install_runtime


def install_native_runtime(output_dir=None, namespace=None):
    del output_dir
    namespace = namespace if namespace is not None else globals()
    return install_runtime(JsBridgeHost(), namespace=namespace)
