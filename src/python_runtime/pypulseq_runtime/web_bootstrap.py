from .runtime import install_runtime
from .web_host import WebHost


def install_web_runtime(namespace):
    install_runtime(WebHost(), namespace)
