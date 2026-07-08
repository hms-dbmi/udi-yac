# udi-grammar-py

Python code for generating [Universal Discovery Interface](https://github.com/hms-dbmi/udi-grammar) (UDI) specifications.


## Quick Start Guid

`pip install udi-grammar-py`

```
from udi_grammar_py import Chart, Op
spec = (Chart()
    .source("samples", "./data/example_samples.csv")
    .groupby(["organ", "organ_condition"])
    .rollup({"count": Op.count()})
    .mark("bar")
    .x(field="count", type="nominal")
    .y(field="ogan", type="quantitative")
    .color(field="organ_condition", type="quantitative")
    .to_json(pretty=True)
)
print(spec)
```

Result:

```
{
  "source": {
    "name": "samples",
    "source": "./data/example_samples.csv"
  },
  "transformation": [
    {
      "groupby": [
        "organ",
        "organ_condition"
      ]
    },
    {
      "rollup": {
        "count": {
          "op": "count"
        }
      }
    }
  ],
  "representation": {
    "mark": "bar",
    "mapping": [
      {
        "encoding": "x",
        "field": "count",
        "type": "quantitative"
      },
      {
        "encoding": "y",
        "field": "organ",
        "type": "nominal"
      },
      {
        "encoding": "color",
        "field": "organ_condition",
        "type": "nominal"
      }
    ]
  }
}
```
