import json
from typing import Union, List, Dict, Set

PRETTY_INDENT = 4


class Chart:
    def __init__(self):
        self._spec = {}

    def source(self, name, source):
        self._spec.setdefault("source", [])
        self._spec["source"].append({"name": name, "source": source})
        return self

    def transformation(self):
        if "transformation" in self._spec:
            return self._spec["transformation"]
        transformation = Transformation()
        self._spec["transformation"] = transformation
        return transformation

    def groupby(self, field: Union[str, List[str]], **kwargs):
        self.transformation().groupby(field, **kwargs)
        return self

    def binby(self, field: str, **kwargs):
        self.transformation().binby(field, **kwargs)
        return self

    def unnest(self, field: str, **kwargs):
        self.transformation().unnest(field, **kwargs)
        return self

    def rollup(self, rollup_options: Union[str, List[str]], **kwargs):
        self.transformation().rollup(rollup_options, **kwargs)

        return self

    def orderby(self, field: Union[str, List[str]], ascending=True, **kwargs):
        self.transformation().orderby(field, ascending, **kwargs)
        return self

    def join(self, on: Union[str, List[str]], **kwargs):
        self.transformation().join(on, **kwargs)
        return self

    def kde(self, field: Union[str, List[str]], **kwargs):
        self.transformation().kde(field, **kwargs)
        return self

    def derive(self, derive_options: Union[str, Dict], **kwargs):
        self.transformation().derive(derive_options, **kwargs)
        return self

    def filter(self, filter_expression: Union[str, Dict], **kwargs):
        self.transformation().filter(filter_expression, **kwargs)
        return self

    def representation(self):
        if "representation" in self._spec:
            return self._spec["representation"]
        representation = Representation()
        self._spec["representation"] = representation
        return representation

    def mark(self, mark: str):
        self.representation().mark(mark)
        return self

    def title(self, text: str, align: str = None):
        """Set the visualization's heading. Left-aligned unless `align` says otherwise."""
        self._spec["title"] = text if align is None else {"text": text, "align": align}
        return self

    def stroke_dash(self, pattern):
        """Dash the most recently added layer's stroke."""
        self.representation().stroke_dash(pattern)
        return self

    def place(self, **kwargs):
        """Anchor/nudge the most recently added layer (text placement)."""
        self.representation().place(**kwargs)
        return self

    def outline(self, **kwargs):
        """Outline the most recently added layer (text legibility halo)."""
        self.representation().outline(**kwargs)
        return self

    def interpolate(self, method: str):
        """Set how the most recently added line layer connects its points."""
        self.representation().interpolate(method)
        return self

    def avoid_overlap(self, min_gap=True):
        """Keep the most recently added layer's marks from overlapping."""
        self.representation().avoid_overlap(min_gap)
        return self

    def map(self, encoding: str, **kwargs):
        self.representation().map(encoding, **kwargs)
        return self

    def x(self, **kwargs):
        return self.map("x", **kwargs)

    def y(self, **kwargs):
        return self.map("y", **kwargs)

    def x2(self, **kwargs):
        return self.map("x2", **kwargs)

    def y2(self, **kwargs):
        return self.map("y2", **kwargs)

    def xOffset(self, **kwargs):
        return self.map("xOffset", **kwargs)

    def yOffset(self, **kwargs):
        return self.map("yOffset", **kwargs)

    def color(self, **kwargs):
        return self.map("color", **kwargs)

    def size(self, **kwargs):
        return self.map("size", **kwargs)

    def shape(self, **kwargs):
        return self.map("shape", **kwargs)

    def theta(self, **kwargs):
        return self.map("theta", **kwargs)

    def theta2(self, **kwargs):
        return self.map("theta2", **kwargs)

    def radius(self, **kwargs):
        return self.map("radius", **kwargs)

    def radius2(self, **kwargs):
        return self.map("radius2", **kwargs)

    def text(self, **kwargs):
        return self.map("text", **kwargs)

    def stroke(self, **kwargs):
        return self.map("stroke", **kwargs)

    def opacity(self, **kwargs):
        return self.map("opacity", **kwargs)

    def strokeWidth(self, **kwargs):
        return self.map("strokeWidth", **kwargs)

    def to_json(self, pretty=False):
        # clone spec
        clone = self._spec.copy()
        if "source" in clone:
            clone["source"] = unwrap_single_element(clone.get("source"))

        # handle inner object serialization
        def custom_serialization(obj):
            if isinstance(obj, (Representation, Transformation, Layer)):
                return obj.__json__()
            raise TypeError(f"Type {type(obj)} not serializable")

        return json.dumps(
            clone,
            default=custom_serialization,
            indent=PRETTY_INDENT if pretty else None,
        )

    def to_dict(self):
        return json.loads(self.to_json())


class Transformation:
    def __init__(self):
        self._state = []

    def groupby(self, field: Union[str, List[str]], **kwargs):
        transform = {"groupby": field}
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def binby(self, field: str, **kwargs):
        binby_options = {"field": field}
        transfer_kwargs({"bins", "nice", "output"}, binby_options, kwargs)
        transform = {"binby": binby_options}
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def unnest(self, field: str, **kwargs):
        """Expand a delimited multi-value column into one row per value.

        The only transformation that increases the row count. `separator`
        defaults to ";" and the inner `out` defaults to overwriting `field`;
        both are passed through as-is. Note the inner `out` (the value column)
        is distinct from the outer `out` (the output table name).
        """
        unnest_options = {"field": field}
        transfer_kwargs({"separator", "value_out"}, unnest_options, kwargs)
        # `value_out` is the caller-facing name for the inner `out`, so the outer
        # table-level `out` stays unambiguous.
        if "value_out" in unnest_options:
            unnest_options["out"] = unnest_options.pop("value_out")
        transform = {"unnest": unnest_options}
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def rollup(self, rollup_options: Union[str, List[str]], **kwargs):
        transform = {"rollup": rollup_options}
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def orderby(self, field: Union[str, List[str]], ascending=True, **kwargs):
        transform = {
            "orderby": {"field": field, "order": "asc" if ascending else "desc"}
        }
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def join(self, on: Union[str, List[str]], **kwargs):
        transform = {"join": {"on": on}}
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def kde(self, field: Union[str, List[str]], **kwargs):
        kde_options = {"field": field}
        transfer_kwargs({"bandwidth", "samples", "output"}, kde_options, kwargs)
        transform = {"kde": kde_options}
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def derive(self, derive_options: Union[str, Dict], **kwargs):
        transform = {"derive": derive_options}
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def filter(self, filter_expression: Union[str, Dict], **kwargs):
        transform = {"filter": filter_expression}
        transfer_kwargs({"in", "out"}, transform, kwargs)
        self._state.append(transform)
        return self

    def __json__(self):
        return self._state


class Representation:
    def __init__(self):
        self._state = []

    def mark(self, mark: str):
        self._current_layer = Layer()
        self._current_layer.mark(mark)
        self._state.append(self._current_layer)
        return self

    def map(self, encoding: str, **kwargs):
        self._current_layer.map(encoding, **kwargs)
        return self

    def stroke_dash(self, pattern):
        self._current_layer.stroke_dash(pattern)
        return self

    def place(self, **kwargs):
        self._current_layer.place(**kwargs)
        return self

    def outline(self, **kwargs):
        self._current_layer.outline(**kwargs)
        return self

    def interpolate(self, method: str):
        self._current_layer.interpolate(method)
        return self

    def avoid_overlap(self, min_gap=True):
        self._current_layer.avoid_overlap(min_gap)
        return self

    def x(self, **kwargs):
        return self.map("x", **kwargs)

    def y(self, **kwargs):
        return self.map("y", **kwargs)

    def x2(self, **kwargs):
        return self.map("x2", **kwargs)

    def y2(self, **kwargs):
        return self.map("y2", **kwargs)

    def xOffset(self, **kwargs):
        return self.map("xOffset", **kwargs)

    def yOffset(self, **kwargs):
        return self.map("yOffset", **kwargs)

    def color(self, **kwargs):
        return self.map("color", **kwargs)

    def size(self, **kwargs):
        return self.map("size", **kwargs)

    def shape(self, **kwargs):
        return self.map("shape", **kwargs)

    def theta(self, **kwargs):
        return self.map("theta", **kwargs)

    def theta2(self, **kwargs):
        return self.map("theta2", **kwargs)

    def radius(self, **kwargs):
        return self.map("radius", **kwargs)

    def radius2(self, **kwargs):
        return self.map("radius2", **kwargs)

    def text(self, **kwargs):
        return self.map("text", **kwargs)

    def stroke(self, **kwargs):
        return self.map("stroke", **kwargs)

    def opacity(self, **kwargs):
        return self.map("opacity", **kwargs)

    def strokeWidth(self, **kwargs):
        return self.map("strokeWidth", **kwargs)

    def __json__(self):
        return unwrap_single_element(self._state)


class Layer:
    def __init__(self):
        self._state = {"mark": None, "mapping": []}

    def mark(self, mark: str):
        self._state["mark"] = mark
        return self

    def stroke_dash(self, pattern):
        """Dash the mark's stroke, as alternating on/off pixel lengths.

        Marks an annotation layer (a reference line, a threshold) so it reads as
        guidance rather than as data.
        """
        self._state["strokeDash"] = list(pattern)
        return self

    def interpolate(self, method: str):
        """How this line connects its points — e.g. "step-after" for a step function.

        A quantity that holds between observations and then jumps is misdrawn by the
        default straight segment, which implies intermediate values nobody measured.
        """
        self._state["interpolate"] = method
        return self

    def outline(self, color: str = "white", width: float = 3, opacity: float = None):
        """Outline the mark — on a text mark, a legibility halo.

        The renderer draws an outlined text layer twice (halo pass, then a clean
        fill pass), because SVG paints stroke over fill and one pass would eat
        into the glyphs.
        """
        self._state["stroke"] = color
        self._state["strokeWidth"] = width
        if opacity is not None:
            self._state["strokeOpacity"] = opacity
        return self

    def avoid_overlap(self, min_gap=True):
        """Nudge this layer's marks apart when they would draw on the same spot.

        `True` separates them by 5% of the axis; a number sets the minimum
        separation in data units (the pixel size of the plot is not known when the
        spec is written).
        """
        self._state["avoidOverlap"] = min_gap
        return self

    def place(self, align=None, dx=None, dy=None):
        """Anchor and nudge a text mark, which is otherwise centred on its point."""
        if align is not None:
            self._state["align"] = align
        if dx is not None:
            self._state["dx"] = dx
        if dy is not None:
            self._state["dy"] = dy
        return self

    def map(self, encoding: str, **kwargs):
        new_mapping = {"encoding": encoding}
        transfer_kwargs(
            {
                "field",
                "type",
                "value",
                "mark",
                "column",
                "domain",
                "range",
                "omitLegend",
                "orderby",
                "title",
                "domainWhenFiltered",
            },
            new_mapping,
            kwargs,
        )
        self._state["mapping"].append(new_mapping)
        return self

    def __json__(self):
        # duplicate state
        copy = self._state.copy()
        copy["mapping"] = unwrap_single_element(copy["mapping"])
        return copy


def transfer_kwargs(valid_args: Set[str], state: Dict, kwargs):
    if "in_name" in kwargs:
        kwargs["in"] = kwargs.pop("in_name")
    if "out_name" in kwargs:
        kwargs["out"] = kwargs.pop("out_name")
    return state.update({k: v for k, v in kwargs.items() if k in valid_args})


def unwrap_single_element(lst):
    return lst[0] if len(lst) == 1 else lst
