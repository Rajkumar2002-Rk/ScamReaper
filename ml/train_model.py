"""
ScamReaper — on-device scam call detector.

Trains a tiny bag-of-words classifier over a fixed vocabulary, exports it as
`scam_detector.tflite` (a single dense net, well under 5 MB) plus
`vocab.json` so the Swift runtime can tokenize inputs identically.

Classes (argmax index → label):
  0  RED      (scam)
  1  GREEN    (legitimate)
  2  YELLOW   (unsure / neutral)

Inference thresholding is handled on the Swift side: if the top softmax
probability is below 0.70, the verdict is forced to YELLOW regardless of
which class won.
"""

from __future__ import annotations

import json
import os
import random
import re
from pathlib import Path

import numpy as np
import tensorflow as tf


# ---------------------------------------------------------------------------
# 1. Vocabulary.
#
# The Swift runtime does not tokenize with TensorFlow — it loads vocab.json
# and builds a bag-of-words vector by counting how many times each word
# appears in the transcript. So the model must be trained with the SAME
# tokenizer. We define one fixed vocabulary here and use it on both sides.
# ---------------------------------------------------------------------------

SCAM_WORDS = [
    "insurance", "irs", "tax", "social", "security", "ssn",
    "prize", "winner", "won", "congratulations", "selected", "gift",
    "bank", "account", "credit", "card", "routing", "wire", "transfer",
    "urgent", "immediately", "limited", "time", "expire", "expires", "expiring",
    "medicare", "refund", "suspended", "suspend", "verify", "identity", "warrant",
    "arrest", "arrested", "lawsuit", "legal", "action", "penalty", "fine",
    "bitcoin", "crypto", "cryptocurrency", "gift-card", "giftcard", "itunes",
    "amazon", "walmart", "apple-pay", "zelle", "venmo", "western-union",
    "extended", "warranty", "car", "vehicle", "auto",
    "otp", "one-time", "passcode", "code",
    "fraud", "fraudulent", "charge", "charges", "investigation", "frozen",
    "threatened", "police", "court", "subpoena",
    "microsoft", "apple", "tech", "support", "virus", "hack", "hacked", "compromised",
    "deport", "deportation", "immigration", "visa", "citizenship",
]

LEGIT_WORDS = [
    "job", "application", "interview", "recruiter", "hiring", "manager", "position",
    "google", "microsoft-careers", "amazon-careers",
    "delivery", "package", "tracking", "fedex", "ups", "usps", "dhl",
    "appointment", "reschedule", "doctor", "dentist", "clinic", "pharmacy",
    "school", "university", "college", "professor", "student", "class",
    "reference", "referral", "neighbor", "friend", "colleague",
    "confirm", "confirmation", "reminder", "meeting", "scheduled",
    "returning", "return", "calling-back", "follow-up",
    "please", "thank", "thanks", "sorry",
    "office", "clinic", "hospital",
]

NEUTRAL_WORDS = [
    "hello", "hi", "hey", "yes", "no", "okay", "ok", "sure", "maybe",
    "calling", "phone", "number", "home", "homeowner", "resident",
    "message", "leave", "voicemail",
    "speak", "talk", "tell",
    "important", "matter", "regarding", "about",
    "company", "business", "service", "services",
]

VOCAB: list[str] = sorted(set(SCAM_WORDS + LEGIT_WORDS + NEUTRAL_WORDS))
WORD_INDEX: dict[str, int] = {w: i for i, w in enumerate(VOCAB)}
VOCAB_SIZE = len(VOCAB)

LABEL_RED, LABEL_GREEN, LABEL_YELLOW = 0, 1, 2
NUM_CLASSES = 3


# ---------------------------------------------------------------------------
# 2. Tokenizer shared with Swift.
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9\-']*")


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


def vectorize(text: str) -> np.ndarray:
    """Bag-of-words frequency vector over the fixed vocabulary."""
    vec = np.zeros(VOCAB_SIZE, dtype=np.float32)
    for tok in tokenize(text):
        idx = WORD_INDEX.get(tok)
        if idx is not None:
            vec[idx] += 1.0
    # L1 normalise so longer transcripts don't dominate
    total = vec.sum()
    if total > 0:
        vec /= total
    return vec


# ---------------------------------------------------------------------------
# 3. Synthetic training corpus.
#
# Real-world fine-tuning would use anonymised scam-call transcripts, but for
# the MVP we generate labelled sentences from the keyword lists. The model's
# job is just to learn that the presence of SCAM_WORDS pulls toward RED,
# LEGIT_WORDS toward GREEN, and NEUTRAL_WORDS alone → YELLOW.
# ---------------------------------------------------------------------------

SCAM_TEMPLATES = [
    "This is the IRS calling about your suspended Social Security number.",
    "Congratulations you have been selected to win a prize, please confirm your credit card.",
    "Your bank account has been compromised, we need to verify your identity immediately.",
    "Your car warranty is about to expire, call back with your credit card to renew.",
    "The Social Security Administration has issued a warrant for your arrest unless you pay now.",
    "We detected a fraudulent charge, confirm the one-time passcode we just sent.",
    "This is Microsoft tech support, your computer has a virus and we need remote access.",
    "To claim your free gift card please wire $4.99 for shipping.",
    "Your Medicare benefits are suspended, verify your SSN to reinstate them.",
    "Immigration is filing deportation paperwork against you, pay now or be arrested.",
    "Urgent: your Amazon account has unauthorized charges, confirm your bank routing number.",
    "Send bitcoin to this wallet to avoid legal action from the tax office.",
    "This is your final notice, your account will be frozen unless you verify immediately.",
    "A lawsuit has been filed, press one to speak to our legal department and pay the fine.",
]

LEGIT_TEMPLATES = [
    "Hi, this is a recruiter from Google calling about your job application for the software engineer position.",
    "This is the delivery driver, your package tracking number 1Z999 will arrive today.",
    "Hello, I'm calling to confirm your dentist appointment tomorrow at 2pm.",
    "Hi, I'm the hiring manager at Amazon returning your call about the interview.",
    "This is the pharmacy, your prescription is ready for pickup.",
    "Hi, I'm calling from the university admissions office about your application.",
    "Your FedEx package could not be delivered, please call to reschedule.",
    "This is Dr. Patel's office calling to remind you of your checkup tomorrow.",
    "Hello, I'm a reference from your job application at Microsoft.",
    "This is the school nurse, I need to speak with the parent.",
    "Hi, I'm calling to confirm your meeting scheduled for 3pm.",
    "Your USPS package is out for delivery.",
    "This is a follow-up call from the clinic about your test results.",
]

UNSURE_TEMPLATES = [
    "Hello, is this the homeowner?",
    "Hi, I need to speak with whoever is in charge.",
    "Is this a good time to talk?",
    "Hello, can I leave a message?",
    "Hi, I'm calling about an important matter.",
    "This is a courtesy call.",
    "Are you the resident of this home?",
    "I'm calling about a service in your area.",
    "Please call me back when you get this message.",
    "Can you hear me okay?",
    "Hi, I'm following up on my earlier call.",
]


def _jitter(template: str) -> str:
    """Lightly augment a template with filler words so the model sees variety."""
    fillers = ["um", "uh", "well", "so", "listen", "you know", "actually"]
    words = template.split()
    # maybe insert a filler at a random position
    if random.random() < 0.5 and len(words) > 2:
        pos = random.randint(1, len(words) - 1)
        words.insert(pos, random.choice(fillers))
    # optionally drop the trailing period
    return " ".join(words).rstrip(".")


def build_dataset(samples_per_class: int = 600, seed: int = 42):
    rng = random.Random(seed)

    def make(templates, label, n):
        items = []
        for _ in range(n):
            t = rng.choice(templates)
            items.append((_jitter(t), label))
        return items

    data = (
        make(SCAM_TEMPLATES, LABEL_RED, samples_per_class)
        + make(LEGIT_TEMPLATES, LABEL_GREEN, samples_per_class)
        + make(UNSURE_TEMPLATES, LABEL_YELLOW, samples_per_class)
    )
    rng.shuffle(data)
    texts, labels = zip(*data)
    x = np.stack([vectorize(t) for t in texts])
    y = tf.keras.utils.to_categorical(labels, num_classes=NUM_CLASSES)
    return x, y


# ---------------------------------------------------------------------------
# 4. Model — tiny dense net. Final converted size is a few KB.
# ---------------------------------------------------------------------------

def build_model() -> tf.keras.Model:
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(VOCAB_SIZE,), name="bag_of_words"),
            tf.keras.layers.Dense(32, activation="relu"),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(NUM_CLASSES, activation="softmax", name="verdict"),
        ]
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


# ---------------------------------------------------------------------------
# 5. Train + convert.
# ---------------------------------------------------------------------------

OUT_DIR = Path(__file__).resolve().parent
MODEL_PATH = OUT_DIR / "scam_detector.tflite"
VOCAB_PATH = OUT_DIR / "vocab.json"
METADATA_PATH = OUT_DIR / "model_metadata.json"


def main():
    print(f"Vocabulary size: {VOCAB_SIZE}")
    x_train, y_train = build_dataset(samples_per_class=600)
    x_val, y_val = build_dataset(samples_per_class=100, seed=7)

    model = build_model()
    model.fit(
        x_train, y_train,
        validation_data=(x_val, y_val),
        epochs=40,
        batch_size=32,
        verbose=2,
    )

    # --- Convert to TFLite --------------------------------------------------
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    tflite_model = converter.convert()
    MODEL_PATH.write_bytes(tflite_model)
    size_kb = MODEL_PATH.stat().st_size / 1024
    print(f"Wrote {MODEL_PATH} ({size_kb:.1f} KB)")

    # --- Export vocab for Swift --------------------------------------------
    VOCAB_PATH.write_text(
        json.dumps(
            {
                "vocab": VOCAB,
                "labels": ["RED", "GREEN", "YELLOW"],
                "tokenizer": "lowercase-regex",
                "regex": _TOKEN_RE.pattern,
                "normalization": "l1",
            },
            indent=2,
        )
    )
    print(f"Wrote {VOCAB_PATH}")

    METADATA_PATH.write_text(
        json.dumps(
            {
                "inputShape": [1, VOCAB_SIZE],
                "inputDtype": "float32",
                "outputShape": [1, NUM_CLASSES],
                "outputDtype": "float32",
                "classes": ["RED", "GREEN", "YELLOW"],
                "confidenceThreshold": 0.7,
                "vocabSize": VOCAB_SIZE,
            },
            indent=2,
        )
    )
    print(f"Wrote {METADATA_PATH}")


if __name__ == "__main__":
    main()
