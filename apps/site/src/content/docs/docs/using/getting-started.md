---
title: Get started
description: Choose a dataset, add an OpenAI key, and ask your first question.
sidebar:
  order: 2
---

## Choose a dataset

The [home page](/udi-yac/) lists the datasets you can explore:

| Dataset                          | What it holds                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clinical cancer cohort (pcx)** | De-identified records for 969 patients in 7 linked tables: demographics, disease events, medical therapy, radiation, surgery, survival and a treatment summary.      |
| **HuBMAP**                       | Donor, sample and dataset metadata from the [Human BioMolecular Atlas Program](https://portal.hubmapconsortium.org/) portal. The largest dataset here (about 11 MB). |
| **Palmer penguins**              | Body measurements for 344 penguins. One small table, good for a first try.                                                                                           |

Each dataset card offers two ways in:

- **A predefined session** opens a conversation and dashboard someone has already built. You don't need an API key to look around in one (see below).
- **New session** opens an empty dashboard, ready for your questions.

Inside the app, the bar at the top switches dataset or session at any time. Switching reloads the page, so anything you have not [saved](/udi-yac/docs/using/sessions/) is lost.

To see what a dataset contains before you ask, open the **Data overview**: the database icon at the top of the chat (the **Data** tab on narrower screens), or any of the counts above the dashboard. It lists every table, how the tables join, and each field with its possible values. Hover a field to read its description.

## Add your OpenAI key

The public site uses your own OpenAI key to answer questions. Until you add one, the chat input is replaced by **"Enter your OpenAI API key to start chatting"**.

- Paste a key that starts with `sk-` and select **Set key**.
- The key stays in this browser's local storage, so you only enter it once per browser. It is sent with each question, in the `X-OpenAI-Key` header, to the YAC agent server, which uses it to call OpenAI for that request and does not keep it.
- Each question sends the agent your conversation and the dataset's structure (table and field names, descriptions and field values), not its rows.
- The key icon at the top of the chat opens **API Key & Usage**. It shows the tokens this conversation has used, and **Clear key** removes the key from this browser.

**Without a key** you can still open a predefined session and explore it: charts render, filters and brushing work, and the dropdowns under each chart can still change its fields, because those changes don't call the model. Only asking a new question needs the key.

## Ask a question

Type in the box at the bottom of the chat and press **Enter** (**Shift+Enter** adds a new line). If you're not sure what to ask, the chat starts with suggestions under **"Try asking one of these:"**, and the lightbulb icon (**Example prompts**) lists them again.

Questions that work well name what you want to see and how to split it:

- _"What is the distribution of age at initial diagnosis?"_
- _"Break down radiation type by radiation site."_
- _"Does survival differ for patients who had radiation as part of their initial treatment?"_
- _"Filter to medulloblastoma patients."_

If a word in your question could mean more than one field, the agent asks: pick the field you meant from the buttons, or type your own reply.

To start over, use **Reset conversation** (the circular arrow at the top of the chat). It clears the chat, every chart, every filter and the closed-chart memory bank.
