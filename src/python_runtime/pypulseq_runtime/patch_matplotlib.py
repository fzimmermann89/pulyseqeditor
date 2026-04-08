import base64
import contextlib
import io

import matplotlib

matplotlib.use("Agg")

from matplotlib import pyplot as plt

from .host import HostBridge


def figure_title(figure, index):
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


def export_open_figures(host: HostBridge, state):
    figure_numbers = list(plt.get_fignums())
    if not figure_numbers:
        return

    state["show_called"] = True
    preferred_plot_format = None
    with contextlib.suppress(Exception):
        preferred_plot_format = host.preferred_plot_format()

    for figure_index, figure_number in enumerate(figure_numbers):
        figure = plt.figure(figure_number)
        title = figure_title(figure, figure_index)

        if preferred_plot_format == "png":
            png_buffer = io.BytesIO()
            figure.savefig(png_buffer, format="png", bbox_inches="tight")
            host.emit_plot(
                figure_index=figure_index,
                title=title,
                mime="image/png",
                data=base64.b64encode(png_buffer.getvalue()).decode("ascii"),
            )
            continue

        svg_buffer = io.StringIO()
        try:
            figure.savefig(svg_buffer, format="svg", bbox_inches="tight")
            host.emit_plot(
                figure_index=figure_index,
                title=title,
                mime="image/svg+xml",
                data=svg_buffer.getvalue(),
            )
            continue
        except Exception:
            pass

        png_buffer = io.BytesIO()
        figure.savefig(png_buffer, format="png", bbox_inches="tight")
        host.emit_plot(
            figure_index=figure_index,
            title=title,
            mime="image/png",
            data=base64.b64encode(png_buffer.getvalue()).decode("ascii"),
        )

    plt.close("all")


def install_show(host: HostBridge, state):
    def _show(*_args, **_kwargs):
        export_open_figures(host, state)

    plt.show = _show
    return _show
