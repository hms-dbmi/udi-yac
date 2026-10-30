---
title: Work with charts
description: Tweak a chart's fields, filter by brushing, rearrange the dashboard and download data.
sidebar:
  order: 3
---

Every chart lands on the dashboard as a card, with a matching **Visualization added** entry in the chat. Hover either one to highlight the other.

## Change what a chart shows

Under **Visualization added** in the chat, a row of dropdowns reads like `color: Diagnosis Type Cohort` or `y: Event Type`. Each one is a choice the agent made. Pick another value and the chart redraws, with no new question and no model call. The sliders icon on the card (**Tweak fields**) shows the same dropdowns on the card itself.

Some charts offer more than fields:

- **Survival curves** have an **estimator** (Kaplan-Meier, or a basic events-over-cohort count), a **time span** (1 to 10 years, or the full follow-up; 5 years by default) and a **confidence band** (show or hide the 95% interval).
- **Charts split into groups** show a `groups` button. For a category field, combine values into named groups, and everything else falls into _Other_. For a numeric field, click the histogram to add a threshold, or drag one to move it; **Halve** and **Quarters** split the range evenly. A chart can show at most 10 groups. Select **Apply** to redraw.

After a change, the chat notes **Fields changed**, with a reset button that takes the chart back to the agent's original choice.

## Filter the dashboard

Every chart, count and table on the dashboard shows the same filtered data.

- **Brush a chart**: drag across a range, or click a bar or category. The other charts update to match.
- **Ask for a filter**: _"Filter to medulloblastoma patients."_
- Each filter appears as a chip under **Filters** above the dashboard, and as an entry in the chat at the point where you made it. Click a chip to edit its values, or remove it. **Reset** clears every filter.
- If a filter you asked for matches nothing, YAC offers fields or values that do exist, such as _Did you mean…_ suggestions.

The counts at the top of the dashboard show how many rows of each table pass the filters, as _filtered / total_.

## The card toolbar

From left to right, the icons on a card:

| Icon      | Name                                        | What it does                                                                                                                                                   |
| --------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⠿         | **Drag to reorder card**                    | Drag to move the card. Resize from its right or bottom edge.                                                                                                   |
| Title     | **Click to rename**                         | Give the chart your own title. Clear it to go back to the generated one.                                                                                       |
| Crosshair | **Show message in chat**                    | Scrolls the chat to the question that made this chart.                                                                                                         |
| Sliders   | **Tweak fields**                            | Shows the field dropdowns on the card.                                                                                                                         |
| Table     | **Show table** / **Show chart**             | Switches between the chart and the data behind it.                                                                                                             |
| Sort      | **Sort by total** / **Sort alphabetically** | Reorders the categories.                                                                                                                                       |
| Info      |                                             | Explains the chart and lists, in plain language, each step that turned the data into it.                                                                       |
| ✕         | **Close**                                   | Removes the card. Closed charts go to **Recently Closed** above the chat input, and the **Memory bank** icon at the top of the chat; restore them from either. |

Not every icon shows on every card: a chart with nothing to tweak has no sliders, and a table has no table toggle.

## Arrange the dashboard

The gear icon (**Display settings**) sets the number of columns, the row height and the text size, and **Reset layout** tidies the cards back into rows. Row height and text size are remembered in this browser. When the dashboard is too narrow for the row counts and its buttons side by side, **Display settings**, **Session** and **Download Data** fold into one gear menu (**Dashboard options**).

## Download data

**Download Data** above the dashboard offers **Download Raw Data**: the rows that pass the current filters, one CSV per table, in a zip. For HuBMAP data, **Download Manifest** saves the `hubmap_id` of each of those rows instead.
