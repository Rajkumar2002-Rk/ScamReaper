# Security Policy

ScamReaper is built to protect people from phone scams. That mission
means we take security reports very seriously — both bugs that weaken
the scam detector and bugs that could expose a user's device.

Thank you in advance for taking the time to report anything you find.

---

## Reporting a vulnerability

**Please do not open a public GitHub issue for security bugs.**

Instead, report privately via one of:

1. **GitHub Security Advisories** (preferred) — go to the repository's
   **Security → Report a vulnerability** tab. This creates a private
   advisory only visible to maintainers.
2. **Email** — `security@scamreaper.app` (or the email listed in the
   repository `README`). PGP key on request.

Please include:

- A clear description of the issue and the impact.
- Step-by-step reproduction (a sample transcript, a crafted input, or
  a patch diff is ideal).
- The iOS version, device, and app version you tested on.
- Whether you are willing to be credited in the Hall of Fame below.

---

## What happens after you report

| Day          | What we do                                                    |
|--------------|---------------------------------------------------------------|
| ≤ 48 hours   | We acknowledge your report.                                   |
| ≤ 7 days     | We confirm whether we can reproduce it and triage severity.   |
| ≤ 30 days    | We ship a fix, or give you a concrete timeline and reason.    |
| On release   | We publish a coordinated advisory crediting you (if you wish).|

We will never threaten legal action against a good-faith researcher.

---

## In scope

- The TensorFlow Lite model and its inputs — anything that makes RED
  calls classified as GREEN, or vice-versa, at scale.
- The native Swift module (`ScamDetectorModule.swift`) — integrity
  checks, timing channels, model tampering, crashes.
- The security layer (`security/*`) — audit log tampering,
  anti-bypass evasion, fingerprint pinning bypass.
- The notification action handlers — anything that lets a notification
  payload execute unintended actions.
- Local storage — anything that leaks transcripts or verdicts off
  the device, or lets another app on the device read them.

## Out of scope

- Issues that require physical access to an unlocked device.
- Bugs in third-party dependencies already disclosed upstream (please
  report those to the upstream project).
- Social-engineering attacks on the user outside the app.
- DoS that requires the user to paste 100 MB of text into a field.
- The deliberately tiny toy training dataset in `ml/training_data.py` —
  improving it is welcome, but misclassifications on it are not
  security bugs on their own.

---

## Hall of Fame

Researchers who have responsibly disclosed issues will be listed here
(with permission). If you are the first, your name goes at the top.

_(empty — be the first)_

---

## A note to scammers

If you are here looking for ways to bypass ScamReaper: every bypass
attempt is detected, logged locally on the user's device, and forced
to a RED verdict. The source is open precisely because we are not
afraid of you reading it. If you find a real hole, report it — we
would rather fix it than have it used.
