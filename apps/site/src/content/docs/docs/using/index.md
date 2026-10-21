---
title: What is YAC?
description: YAC turns questions about a biomedical dataset into linked, interactive charts.
sidebar:
  order: 1
---

YAC lets you explore a dataset by asking questions in plain language. Each answer is a chart on a dashboard. The charts are linked: select a range or a category on one, and every other chart, count and table updates to match.

You can also refine a chart without typing a new question. The dropdowns under each chart in the conversation change the fields it uses, such as what it splits by or what it counts.

## What happens when you ask

1. **You type a question** in the chat, for example _"Compare survival from initial diagnosis between the two diagnosis cohorts."_
2. **The agent reads the dataset's structure.** That is the table and field names, their descriptions and the values a field takes. It does not see the rows themselves.
3. **It picks a chart.** Most charts come from a library of templates (see the [chart gallery](/udi-yac/docs/charts/)). The agent binds a template's slots to the tables and fields that fit your question. When no template fits, it writes a chart from scratch.
4. **Your browser draws it.** The data is loaded and filtered in your browser, so charts and filters respond without a round trip.

Besides charts, the agent can answer in text (for example, _"What does each table in this dataset describe?"_), add a filter, or ask which field you meant when a word in your question could match several.

## The pieces

YAC has three parts, each published on its own:

- **The chat** ([`udi-yac`](https://www.npmjs.com/package/udi-yac) on npm): the app you see. It can be embedded in other sites.
- **The agent** ([`udiagent`](https://pypi.org/project/udiagent/) on PyPI): the server that turns a question into a chart, using a large language model.
- **The grammar** ([`udi-toolkit`](https://www.npmjs.com/package/udi-toolkit) on npm): the chart format both sides share, and the component that renders it. The [grammar demo](/udi-yac/grammar/) shows examples.

To run or embed any of these, see [Integrate](/udi-yac/docs/integrate/chat/).

## Next

- [Get started](/udi-yac/docs/using/getting-started/): choose a dataset and ask your first question.
- [Work with charts](/udi-yac/docs/using/charts/): tweak, filter, rearrange.
- [Sessions](/udi-yac/docs/using/sessions/): save your work and pick up where you left off.
