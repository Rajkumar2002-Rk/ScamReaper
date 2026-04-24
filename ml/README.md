# ScamReaper — Model Training & Integration

This folder owns the on-device scam classifier.

Everything here runs offline. The trained model is shipped inside the iOS
bundle as `scam_detector.tflite`, plus a companion `vocab.json` so the
Swift runtime tokenizes text identically to training.

---

## 1. Train the model

Requires Python 3.10 – 3.11 (TensorFlow 2.14 does not support newer
Pythons yet).

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python train_model.py
```

Output files are written next to `train_model.py`:

| File                   | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `scam_detector.tflite` | Quantised TFLite model (a few KB, well under the 5 MB limit).     |
| `vocab.json`           | Ordered vocabulary + tokenizer rules shared with the Swift side.  |
| `model_metadata.json`  | Input/output shapes and the 0.70 confidence threshold.            |

Training takes ~30 seconds on a laptop CPU. No GPU required. No data leaves
your machine — the training corpus is generated from the keyword lists in
`train_model.py` itself.

### Extending the training data

Add more phrases to `SCAM_TEMPLATES`, `LEGIT_TEMPLATES`, or
`UNSURE_TEMPLATES` in `train_model.py`, then re-run. If you introduce a new
keyword, also add it to the appropriate list (`SCAM_WORDS`, `LEGIT_WORDS`,
or `NEUTRAL_WORDS`) so the bag-of-words tokenizer picks it up.

---

## 2. Bundle the model into the iOS app

The native module looks up `scam_detector.tflite` and `vocab.json` via
`Bundle.main`. Drop both files into the iOS target's **Copy Bundle
Resources** phase:

1. Open `ios/ScamReaper.xcworkspace` in Xcode.
2. In the Project Navigator select the **ScamReaper** target.
3. Drag `scam_detector.tflite` and `vocab.json` from Finder into the
   `ScamReaper` group. When Xcode asks:
   - ✅ Copy items if needed
   - ✅ Create groups
   - ✅ Add to target: **ScamReaper**
4. Confirm they appear under **Build Phases → Copy Bundle Resources**.

---

## 3. Link the Swift/Obj-C module

Phase 3 added two source files under `ios/ScamReaperAI/`:

- `ScamDetectorModule.swift`
- `ScamDetectorModule.m`

Because we used `npx expo prebuild`, the `ios/` project is yours to modify.
To expose the module to React Native:

1. In Xcode, right-click the `ScamReaper` group → **Add Files to
   "ScamReaper"…**
2. Select both `.swift` and `.m` files from `ios/ScamReaperAI/`.
3. When prompted, let Xcode create an Objective-C bridging header. If it
   already exists (from a previous Swift file), Xcode will skip this step.
4. Add the TensorFlow Lite dependency. Open `ios/Podfile` and inside the
   main target block add:
   ```ruby
   pod 'TensorFlowLiteSwift', '2.14.0'
   ```
5. From the `ios/` directory run `pod install`.
6. Build the app (`Cmd+B`). The module should register under the name
   `ScamDetector` in `NativeModules`.

If you'd rather not touch the Podfile yet (e.g. still developing in the
simulator), skip steps 4–5 — the JavaScript layer automatically falls back
to the keyword classifier in `services/NativeScamDetector.ts`, so the app
still works end-to-end.

---

## 4. Verifying the integration

From the React layer:

```ts
import { NativeScamDetector } from '@/services/NativeScamDetector';

await NativeScamDetector.isAvailable();   // true once the Swift module is linked
await NativeScamDetector.analyze('This is the IRS, your SSN is suspended');
// → { verdict: 'RED', confidence: 0.94, source: 'tflite', scores: {...} }
```

In the app UI you can exercise the flow via **Settings → Developer Tools
→ Simulate Screened Call**. The resulting entry in the call log shows
which engine classified it (TensorFlow Lite or keyword fallback) along
with its confidence.

---

## 5. App Store notes

- Final `.tflite` size is a few KB — well below Apple's on-disk ML limits.
- Inference runs entirely on-device; no tracking SDKs or network calls are
  introduced.
- TFLite Swift 2.14.0 supports iOS 12+ and arm64 simulators.
