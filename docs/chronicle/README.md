# The Chronicle

The Chronicle is the repository's dated index of lessons, measurements, facts,
wrong turns, and trivia. It is deliberately a curated record rather than a
second evidence authority: every finding points back to a tracked path or a
commit, and the evidence record remains authoritative for a claim ceiling.

The source is split into one JSON file per checkpoint window under
[`entries/`](entries/). Add a new month by copying the checkpoint shape into a
new `YYYY-MM.json` file; do not edit the generated page by hand.

```sh
node tools/chronicle-harvest.mjs --since <previous-checkpoint-tip> --json
# review, keep, edit, or drop the candidates
npm run chronicle
node tools/test-chronicle.mjs
```

The schema vocabulary is documented in [`entry.schema.json`](entry.schema.json)
and enforced by [`tools/chronicle-schema.mjs`](../../tools/chronicle-schema.mjs).
The generated view is [`../portal/chronicle.html`](../portal/chronicle.html).
It is deterministic, has no runtime dependencies or network calls, and keeps
retracted findings visible with the entry that superseded them.

Each checkpoint contains curated findings rather than a live commit feed. The
generated pulse is derived from those finding dates, so later commits do not
change the page unless a curator adds or edits a checkpoint. The latest
checkpoint may also carry an `outlook` with `next` and `missing` items; the
generator renders that as the chronicle's final section, with the same source
trace discipline as every historical finding.
