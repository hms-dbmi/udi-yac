---
title: Sessions
description: Open a predefined session, save your own in the browser, or export one as a file.
sidebar:
  order: 4
---

A **session** is a conversation together with the dashboard it built: the chat, every chart on the dashboard and their layout. It belongs to one dataset.

## Predefined sessions

Some datasets come with sessions already built, listed on their card on the [home page](/udi-yac/) and in the **Session** picker at the top of the app. Opening one is the quickest way to see what YAC can do, and it needs no API key. You can keep asking questions from where the session leaves off once you add a key.

| Dataset                      | Session         | What it covers                                                                                                              |
| ---------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Clinical cancer cohort (pcx) | **Cohort tour** | Age at diagnosis, treatment sequencing, survival by diagnosis cohort, resection extent, radiation sites and disease events. |

Your changes to a predefined session are not saved back to it. Save your own copy (below) to keep them.

## Save in this browser

Open the **Session** menu above the dashboard and choose **Saved in browser…**.

- Type a name and select **Save** to store the current session.
- The list below shows what you have saved for this dataset, newest first. **Load** replaces the current conversation and dashboard with the saved one. The trash icon deletes it.

Saved sessions stay in this browser only: another browser, another device or a private window won't see them, and clearing site data removes them. Each dataset keeps its own list.

## Export and import a file

To keep a session for good, or to share it, use the **Session** menu:

- **Export session** downloads it as a `.json` file.
- **Import session** loads such a file, replacing the current conversation and dashboard.

Import a session into the dataset it was made with. Its charts refer to that dataset's tables and fields, and won't draw against another one.
