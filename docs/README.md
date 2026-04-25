# 💀 ScamReaper

> **AI powered scam call detector. Free forever. 100% on device. Zero data collection.**

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](./LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-❤️-ff3b30.svg)](#)
[![iOS](https://img.shields.io/badge/iOS-15%2B-black.svg?logo=apple)](#)
[![Android](https://img.shields.io/badge/Android-planned-3ddc84.svg?logo=android)](#)
[![React Native](https://img.shields.io/badge/React%20Native-0.76-61dafb.svg?logo=react)](#)
[![TensorFlow Lite](https://img.shields.io/badge/TensorFlow%20Lite-on--device-ff6f00.svg?logo=tensorflow)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

ScamReaper listens to the transcript of a call, runs it through a TensorFlow
Lite model that lives entirely on your phone, and tells you whether the caller
is a scam — in under a second, without sending a single byte to a server.

No accounts. No cloud. No ads. No tracking. No subscriptions. **Ever.**

---

## 🚧 Current status

> ⚠️ **This project is under active development.**
> It is **NOT** yet available on the App Store or Google Play Store.

**What exists today:**
- ✅ Complete UI built and running on simulator
- ✅ TFLite AI model trained locally
- ✅ iOS 26 Call Screening integration coded
- 🛠 Android live call monitoring in development
- ✅ Security system implemented

**What still needs to happen:**
- 🔑 Apple Developer Account for real device testing
- 📱 Real device testing on iPhone with iOS 26
- 🔗 Native CallKit extension proper linking
- 🤖 Android build and testing
- 🚀 App Store and Play Store submission

**Platform plans:**
- **iOS:** Pre-call screening using iOS 26
- **Android:** Full live call monitoring during calls (Android gives more system-level access)

If you want to help get this to a shippable v1.0, see [Contributing](#-contributing). Real-device testers and Android engineers especially welcome.

---

## 📸 Screenshots

> _Real screenshots coming soon. Placeholders below._

| Home | Call Detail | Stats | Security |
|------|-------------|-------|----------|
| ![home](./screenshots/home.png) | ![detail](./screenshots/detail.png) | ![stats](./screenshots/stats.png) | ![security](./screenshots/security.png) |

---

## 🧠 How it works

```
 📞 Incoming call
      │
      ▼
 📝 iOS Call Screening delivers a transcript
      │
      ▼
 🌐 Language detector
      ├── Not English?  ──────────▶ 🟡 YELLOW  (always — we won't guess)
      └── English ──┐
                    ▼
 🛡  Anti-bypass check
      ├── Keyword stuffing / robotic / repeated script?  ──▶ 🔴 RED (forced)
      └── clean ──┐
                  ▼
 🤖 TensorFlow Lite bag-of-words classifier (on-device, ~5 ms)
      │
      ▼
 🎯 Confidence tier
      ├── < 0.70 ──────────────▶ 🟡 YELLOW (unsure)
      ├── 0.70 – 0.85 ────────▶ verdict + "Low Confidence" tag
      └── ≥ 0.85 ──────────────▶ verdict
      │
      ▼
 🔔 Smart notification
      ├── 🔴 SCAM BLOCKED        [View Details] [Block Number]
      ├── 🟢 Legitimate           [Accept] [Decline] [Ask More]
      ├── 🟡 Unsure               [View] [Call Back] [Dismiss]
      └── 🌐 Unknown Language     [Listen] [Block] [Dismiss]
      │
      ▼
 💾 Stored locally (last N calls). Nothing ever leaves the device.
```

---

## ✨ Features

- 🔴🟢🟡 **Three-class on-device verdict** — RED / GREEN / YELLOW
- 🤖 **TensorFlow Lite model** (~7 KB, <5 ms inference on an iPhone)
- 🔔 **Smart notifications with action buttons** (Accept / Decline / Ask More / Block / View)
- 🌐 **Language awareness** — Spanish, Hindi, Telugu, Mandarin, French, Arabic, Russian detected and flagged YELLOW so the English-trained model never judges them
- 🛡 **Anti-bypass detection** — keyword stuffing, hidden payloads, robotic speech, and repeated scripts from the same number force RED
- 🔒 **Model integrity verification** — SHA-256 fingerprint of the `.tflite` is pinned on first run; app alerts if tampered
- ⏱ **Timing-attack prevention** — every verdict takes the same wall-time (no latency side channel)
- 📊 **Statistics dashboard** — calls screened, scams blocked this week/month/today, time saved, 7-day trend
- 🛑 **Security audit log** — last 100 events (integrity checks, bypass attempts, fallbacks) stored locally and viewable in-app
- 😄 **Rage Mode (opt-in)** — on RED calls the AI suggests a harmless distracting reply in one of six languages to waste the scammer's time. Strictly non-malicious, off by default.
- 👋 **Friendly onboarding** — grandma-proof copy, no jargon

---

## 🔐 Privacy promise

ScamReaper will **never**:

- Make a network request related to call analysis.
- Upload transcripts, phone numbers, or verdicts.
- Use advertising, tracking, or analytics SDKs.
- Require an account, login, or subscription.

Everything is computed with on-device code you can read in this repo.

---

## 🧰 Tech stack

| Layer              | Tech                                             |
|--------------------|--------------------------------------------------|
| App                | React Native + Expo SDK 54, expo-router          |
| Inference          | TensorFlow Lite Swift 2.14 (on-device)           |
| Native bridge      | Swift + Obj-C, `RCT_EXTERN_MODULE`               |
| Integrity          | CryptoKit SHA-256 fingerprint pinning            |
| Storage            | AsyncStorage (local, unencrypted — no secrets)   |
| Notifications      | expo-notifications with categorized actions      |
| Training           | Python 3.11 + TensorFlow 2.14 (`ml/train_model.py`) |
| License            | MIT                                              |

---

## 🚀 Installation (contributors)

Requirements: macOS with Xcode 15+, Node 18+, CocoaPods, Python 3.11+

```bash
# 1. Clone
git clone https://github.com/<your-handle>/ScamReaper.git
cd ScamReaper

# 2. JS deps
npm install

# 3. iOS native deps
cd ios && pod install && cd ..

# 4. Train the AI model (the .tflite is gitignored — you generate it)
cd ml
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python train_model.py     # writes scam_detector.tflite + vocab.json
cd ..

# 5. Copy model into the iOS bundle (first time only)
cp ml/scam_detector.tflite ios/ScamReaper/
cp ml/vocab.json            ios/ScamReaper/

# 6. Run
npx expo run:ios
```

---

## 🧪 Training the AI model

The classifier is a 3-class bag-of-words network. Dataset lives in
`ml/training_data.py` — add your own labeled examples and retrain:

```bash
cd ml
source venv/bin/activate
python train_model.py
```

Outputs:
- `scam_detector.tflite` — the model iOS loads
- `vocab.json` — the shared vocabulary (Python and Swift both tokenize with it)

**Training tips**
- Keep `RED` examples diverse — include IRS scams, fake bank fraud, tech support, lottery, romance, and "you owe us money" variants.
- Balance the classes — 40% RED, 40% GREEN, 20% YELLOW works well.
- Test on your own examples before committing. The toy dataset is intentionally tiny.

---

## 🤝 Contributing

Pull requests are welcome. See [CONTRIBUTING.md](../CONTRIBUTING.md) for details. A few principles:

1. **No network calls for anything related to screening.** The privacy promise is load-bearing.
2. **No third-party analytics or ad SDKs. Ever.**
3. **Multilingual respect.** If you don't have training data for a language, return YELLOW — don't guess.
4. **Security over speed.** A ~200 ms verdict is fine. A 20 ms verdict that leaks information is not.

Run `npx tsc --noEmit` before opening a PR.

---

## 🛡 Reporting a security issue

**Please do not open a public GitHub issue for security bugs.** Use the
[Security Vulnerability template](../.github/ISSUE_TEMPLATE/security_vulnerability.md)
to open a **GitHub Security Advisory** instead, or email the address
configured on the repo. See [SECURITY.md](./SECURITY.md) for the full
process and SLA.

---

## 🌍 Community

ScamReaper is for everyone who has ever been scared by a phone call — and
especially for the people in our lives who are most targeted. If this
project helps one grandmother, it was worth building.

We especially welcome:
- 🧠 AI/ML engineers (model quality, multilingual data)
- 🛡 Security researchers (anti-bypass, integrity, timing)
- 🌐 Multilingual contributors (scam patterns in your language)
- 📱 iOS / Android developers (CallKit, Call Screening, notifications)

Star ⭐ the repo, tell a friend, translate the UI, add a scam pattern you
have seen. Everything contributed stays on-device, forever free.

---

## 📜 License

MIT — see [LICENSE](../LICENSE). Copyright © 2026 ScamReaper Contributors.
