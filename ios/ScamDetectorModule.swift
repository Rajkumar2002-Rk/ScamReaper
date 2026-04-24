// ScamDetectorModule.swift
//
// On-device TensorFlow Lite bridge for ScamReaper.
//
// The module loads `scam_detector.tflite` and `vocab.json` from the app
// bundle on first use, tokenises transcripts with the same rules used in
// training, and returns a verdict string ("RED" | "GREEN" | "YELLOW").
//
// Everything runs on-device. There are no network calls.

import Foundation
import TensorFlowLite

@objc(ScamDetector)
class ScamDetectorModule: NSObject {

  // MARK: - React Native boilerplate

  @objc static func requiresMainQueueSetup() -> Bool { false }

  // Run TFLite off the main thread so UI stays smooth.
  @objc func methodQueue() -> DispatchQueue {
    return DispatchQueue(label: "com.scamreaper.ai", qos: .userInitiated)
  }

  // MARK: - State

  private var interpreter: Interpreter?
  private var vocabIndex: [String: Int] = [:]
  private var vocabSize: Int = 0
  private let numClasses = 3
  private let confidenceThreshold: Float = 0.70
  private let labels = ["RED", "GREEN", "YELLOW"]

  private let loadLock = NSLock()
  private var loadAttempted = false
  private var loadError: String?

  // MARK: - Public API exposed to React Native

  /// Returns `{ verdict: String, confidence: Number, scores: { RED, GREEN, YELLOW } }`.
  /// Never rejects — an internal failure returns a YELLOW verdict with an error message.
  @objc(analyze:resolve:reject:)
  func analyze(_ transcript: String,
               resolver resolve: @escaping RCTPromiseResolveBlock,
               rejecter _: @escaping RCTPromiseRejectBlock) {
    do {
      try ensureLoaded()
    } catch {
      resolve([
        "verdict": "YELLOW",
        "confidence": 0.0,
        "scores": ["RED": 0, "GREEN": 0, "YELLOW": 1],
        "error": "\(error)",
      ])
      return
    }

    guard let interpreter = interpreter else {
      resolve(fallback(reason: "interpreter_unavailable"))
      return
    }

    let vector = vectorize(transcript)
    let input = Data(copyingBufferOf: vector)

    do {
      try interpreter.copy(input, toInputAt: 0)
      try interpreter.invoke()
      let output = try interpreter.output(at: 0)
      let scores: [Float] = output.data.toArray(type: Float.self)
      guard scores.count == numClasses else {
        resolve(fallback(reason: "unexpected_output_shape"))
        return
      }

      // argmax
      var bestIndex = 0
      var bestScore: Float = -.infinity
      for (i, s) in scores.enumerated() where s > bestScore {
        bestIndex = i
        bestScore = s
      }

      // Force YELLOW when the winner is below the confidence threshold.
      let verdict: String = (bestScore < confidenceThreshold) ? "YELLOW" : labels[bestIndex]

      resolve([
        "verdict": verdict,
        "confidence": Double(bestScore),
        "scores": [
          "RED": Double(scores[0]),
          "GREEN": Double(scores[1]),
          "YELLOW": Double(scores[2]),
        ],
      ])
    } catch {
      resolve(fallback(reason: "inference_error:\(error)"))
    }
  }

  /// Diagnostics — lets JS check whether the model is actually loaded.
  @objc(isReady:rejecter:)
  func isReady(_ resolve: @escaping RCTPromiseResolveBlock,
               rejecter _: @escaping RCTPromiseRejectBlock) {
    do {
      try ensureLoaded()
      resolve([
        "ready": true,
        "vocabSize": vocabSize,
        "classes": labels,
        "confidenceThreshold": confidenceThreshold,
      ])
    } catch {
      resolve([
        "ready": false,
        "error": "\(error)",
      ])
    }
  }

  // MARK: - Loading

  private func ensureLoaded() throws {
    loadLock.lock()
    defer { loadLock.unlock() }
    if interpreter != nil { return }
    if loadAttempted, let msg = loadError {
      throw ScamDetectorError.loadFailed(msg)
    }
    loadAttempted = true

    do {
      try loadVocab()
      try loadInterpreter()
      loadError = nil
    } catch {
      loadError = "\(error)"
      throw error
    }
  }

  private func loadVocab() throws {
    guard let url = Bundle.main.url(forResource: "vocab", withExtension: "json") else {
      throw ScamDetectorError.resourceMissing("vocab.json")
    }
    let data = try Data(contentsOf: url)
    let decoded = try JSONSerialization.jsonObject(with: data)
    guard
      let obj = decoded as? [String: Any],
      let words = obj["vocab"] as? [String]
    else {
      throw ScamDetectorError.invalidVocab
    }
    vocabIndex = [:]
    for (i, w) in words.enumerated() {
      vocabIndex[w] = i
    }
    vocabSize = words.count
  }

  private func loadInterpreter() throws {
    guard let path = Bundle.main.path(forResource: "scam_detector", ofType: "tflite") else {
      throw ScamDetectorError.resourceMissing("scam_detector.tflite")
    }
    var options = Interpreter.Options()
    options.threadCount = 2
    let interp = try Interpreter(modelPath: path, options: options)
    try interp.allocateTensors()
    self.interpreter = interp
  }

  // MARK: - Tokenization (must match ml/train_model.py)

  /// Mirrors the regex `[a-zA-Z][a-zA-Z0-9\-']*`, lowercased.
  private static let tokenPattern = try? NSRegularExpression(
    pattern: "[A-Za-z][A-Za-z0-9\\-']*", options: [])

  private func tokenize(_ text: String) -> [String] {
    guard let re = ScamDetectorModule.tokenPattern else { return [] }
    let ns = text as NSString
    let matches = re.matches(in: text, range: NSRange(location: 0, length: ns.length))
    return matches.map { ns.substring(with: $0.range).lowercased() }
  }

  private func vectorize(_ text: String) -> [Float] {
    var vec = [Float](repeating: 0, count: vocabSize)
    var total: Float = 0
    for token in tokenize(text) {
      if let idx = vocabIndex[token] {
        vec[idx] += 1
        total += 1
      }
    }
    if total > 0 {
      for i in 0..<vec.count { vec[i] /= total }
    }
    return vec
  }

  // MARK: - Fallback

  private func fallback(reason: String) -> [String: Any] {
    return [
      "verdict": "YELLOW",
      "confidence": 0.0,
      "scores": ["RED": 0, "GREEN": 0, "YELLOW": 1],
      "error": reason,
    ]
  }
}

// MARK: - Errors

enum ScamDetectorError: Error, CustomStringConvertible {
  case resourceMissing(String)
  case invalidVocab
  case loadFailed(String)

  var description: String {
    switch self {
    case .resourceMissing(let name): return "Missing bundled resource: \(name)"
    case .invalidVocab: return "vocab.json has unexpected structure"
    case .loadFailed(let msg): return "Model load failed: \(msg)"
    }
  }
}

// MARK: - Data helpers

private extension Data {
  init<T>(copyingBufferOf array: [T]) {
    self = array.withUnsafeBufferPointer { Data(buffer: $0) }
  }

  func toArray<T>(type _: T.Type) -> [T] {
    return withUnsafeBytes {
      Array($0.bindMemory(to: T.self))
    }
  }
}
