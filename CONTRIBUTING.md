# Contributing to ScamReaper

First: **thank you.** Every contribution — code, a translated phrase, a new
scam pattern, a bug report — helps protect someone from losing their savings
to a phone scammer.

This is a free, open-source project. It will always be free. It will never
carry ads, trackers, or analytics. If you want to help keep it that way,
read on.

---

## Code of conduct

Be kind. Be patient. Assume good faith. English is not everyone's first
language — this project depends on multilingual contributors. No
harassment, no slurs, no "just joking" gatekeeping, no bad-faith trolling.
Maintainers reserve the right to remove any comment, commit, or contributor
who violates this in spirit or in letter.

If you need to report conduct privately, email the address listed on the
repo or open a private GitHub Security Advisory and mark it as a conduct
issue.

---

## How to report a bug

Use the **Bug report** issue template. At minimum include:

- What you were doing (e.g. "simulated a Spanish scam transcript").
- What you expected.
- What actually happened.
- Device + iOS version + app version.
- Any screenshots or log excerpts.

**Never paste real phone numbers, real transcripts from real calls, or
anything identifying.** Redact to `+1 (XXX) XXX-XXXX` and paraphrase
transcripts.

---

## How to suggest a feature

Use the **Feature request** issue template. Tell us:

- What problem the feature solves (not just what it does).
- Who benefits (grandma? power user? security researcher?).
- Whether you're willing to help build it.

Features that break the privacy promise (network calls, analytics,
cloud inference) will be closed without discussion. Sorry — that's the
one line we will not cross.

---

## How to add multilingual scam patterns

Multilingual coverage is one of the highest-impact things you can
contribute. The rule: **if we don't have training data in a language,
the app must return YELLOW, not RED.** Guessing in someone's grandma's
language is worse than useless — it is dangerous.

To add a language properly:

1. Add script detection in `services/LanguageDetector.ts` if the
   language uses a script we don't already handle.
2. Add **at least 30** labeled scam transcripts and 30 legitimate
   transcripts in that language to `ml/training_data.py`.
3. Retrain with `python ml/train_model.py` and verify accuracy on
   held-out examples you wrote yourself.
4. Lift the "non-English → YELLOW" guard in
   `services/NativeScamDetector.ts` only for languages you have
   actually trained on.
5. Open a PR with the language code, a short description of the
   scam patterns you included, and your accuracy numbers.

Small contributions are welcome too — even adding 10 Spanish phrases
that should trigger RED helps.

---

## How to improve the AI model

The model is intentionally tiny (~7 KB, bag-of-words, 3 classes) so
it ships fast and runs offline. If you want to propose a bigger model:

- **Keep it on-device.** No cloud. No remote inference.
- **Keep it small.** Under 5 MB. Under 50 ms inference on an iPhone 12.
- **Keep it explainable.** We need to be able to tell a user *why* a
  call was flagged.
- Submit a PR with training code, the new `.tflite`, accuracy on the
  current test set, and inference latency measurements.

For the current bag-of-words model, the easiest wins are:

- More diverse RED examples (IRS, bank, tech support, lottery, romance).
- More ambiguous YELLOW examples (surveys, "is this the homeowner?").
- More legitimate GREEN examples (doctor's office, delivery, recruiter).

---

## Development setup

See the [Installation section of the README](./README.md#-installation-contributors).

Before opening a PR:

```bash
npx tsc --noEmit          # must pass
```

If you touched the ML model, also:

```bash
cd ml && python train_model.py
```

And verify the app still runs end-to-end on the simulator.

---

## Pull request checklist

- [ ] `npx tsc --noEmit` passes
- [ ] No new network calls for screening logic
- [ ] No new analytics / ad SDKs added
- [ ] If the PR adds a language, training data is included
- [ ] If the PR changes the model, new `.tflite` benchmarks are in the description
- [ ] Commit messages are clear (imperative mood, short summary)
- [ ] You're OK with your PR being released under MIT

---

## Security issues

**Do not file public GitHub issues for security bugs.** See
[docs/SECURITY.md](./docs/SECURITY.md) for the responsible disclosure
process, SLA, and Hall of Fame.

---

## Thank you

Seriously. You are making phones safer for millions of people who did
not ask to become fraud targets. That matters.
