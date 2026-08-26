# Research reports

Commissioned surveys, retained **in full**. These are the integral reports, not
summaries: the distilled conclusions live in the topic pages that own each
subject, and each report links back to them.

They exist so that a question this project has already paid to answer is not
paid for twice. Every one is a literature and public-source survey — **nothing
in this directory was run on this project's handset, and no number in it is a
measurement of this phone.** Where a report's finding was applied to the
repository, the topic page carries the applied version and this directory keeps
the evidence and the method.

All four were researched on 2026-08-26. The first two ask *"who else has played
this game"*; the second two ask *"what does the platform allow anyone to do"*.

| Report | Question it answers | Distilled into |
|---|---|---|
| [FNAF-BOT-CENSUS.md](FNAF-BOT-CENSUS.md) | What FNaF gameplay bots exist publicly at all? | — (stands alone) |
| [FNAF-BOT-IMPLEMENTATION-COMPARISON.md](FNAF-BOT-IMPLEMENTATION-COMPARISON.md) | How does this project compare to them, and where is it actually strongest? | — (stands alone) |
| [ANDROID-BOT-LANDSCAPE.md](ANDROID-BOT-LANDSCAPE.md) | Has anyone else driven a real-time bot on a physical Android handset, and how? Is this architecture normal? | [`HID-MULTITOUCH.md`](../device/HID-MULTITOUCH.md) §"Prior art" |
| [ANDROID-INPUT-AND-OBSERVATION.md](ANDROID-INPUT-AND-OBSERVATION.md) | What does the platform actually impose on touch injection, sequential input rate, and screen reads — and which of our numbers are physics vs. local artifacts? | [`HID-MULTITOUCH.md`](../device/HID-MULTITOUCH.md) §"Input injection and sequential budgets" + addendum; [`ON-DEVICE-VALIDATION.md`](../device/ON-DEVICE-VALIDATION.md) §"What an observation costs elsewhere" |

Read them together and the position is specific rather than flattering. The
comparison finds **this repository has no recorded full-night stock-device clear
and no complete live reactive controller** — while small external FNaF 1 bots do
demonstrate or claim full progression and 4/20, on other titles and other
platforms. The Android survey finds **no measured closed-loop latency for any
reactive bot on any physical handset**, published anywhere.

So the gap is not "nobody has ever beaten a FNaF game with software". It is that
the *particular* combination here — a real-time reactive controller on a stock
physical handset, with the clear graded rather than claimed — is the part with
no published prior art and no result of our own yet.

**Reading rules.** Every claim in these reports is labelled at the point it is
made: `VERIFIED`/`[V]` (the source or code was fetched and read), `CLAIMED`/`[C]`
(a forum, video or vendor page with no primary), `SOURCE` (read out of AOSP or
kernel code — a fact about the implementation, not a timing measurement),
`INFERENCE`/`[I]`, and `UNKNOWN(reason)` where nothing checked out. An
`UNKNOWN` is a result: it means the question was asked and the public record does
not answer it, so nobody needs to search again.

Corrections found after a report was first distilled are folded back into the
report text and dated, per this repository's retraction rule.
