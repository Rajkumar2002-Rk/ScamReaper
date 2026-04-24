// ScamDetectorModule.swift
//
// On-device TensorFlow Lite bridge for ScamReaper.
//
// Hardened for Phase 4:
//   • SHA-256 fingerprint of the bundled .tflite, exposed to JS for pinning.
//   • Timing-attack prevention — every analyze() call takes at least
//     TIMING_FLOOR_MS regardless of verdict.
//   • Graceful degradation — missing / corrupted model never crashes the
//     app; JS sees a YELLOW fallback and a reason code.
//
// Everything runs on-device. There are no network calls.

import Foundation
import CryptoKit
import TensorFlowLite

@objc(ScamDetector)
class ScamDetectorModule: NSObject {

  // MARK: - React Native boilerplate

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func methodQueue() -> DispatchQueue {
    return DispatchQueue(label: "com.scamreaper.ai", qos: .userInitiated)
  }

  // MARK: - State

  private var interpreter: Interpreter?
  private var vocabIndex: [String: Int] = [:]
  private var vocabSize: Int = 0
  private var modelFingerprint: String = ""
  private var vocabFingerprint: String = ""

  private let numClasses = 3
  private let confidenceThreshold: Float = 0.70
  private let labels = ["RED", "GREEN", "YELLOW"]

  /// Minimum wall-time for analyze() — prevents timing side-channel on verdict.
  private let timingFloorMs: UInt64 = 180

  private let loadLock = NSLock()
  private var loadAttempted = false
  private var loadError: String?

  // MARK: - Public API

  @objc(analyze:resolve:reject:)
  func analyze(_ transcript: String,
               resolver resolve: @escaping RCTPromiseResolveBlock,
               rejecter _: @escaping RCTPromiseRejectBlock) {
    let start = DispatchTime.now()

    func respond(_ payload: [String: Any]) {
      enforceTimingFloor(since: start)
      resolve(payload)
    }

    do {
      try ensureLoaded()
    } catch {
      respond(fallback(reason: "load_failed:\(error)"))
      return
    }

    guard let interpreter = interpreter else {
      respond(fallback(reason: "interpreter_unavailable"))
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
        respond(fallback(reason: "unexpected_output_shape"))
        return
      }

      var bestIndex = 0
      var bestScore: Float = -.infinity
      for (i, s) in scores.enumerated() where s > bestScore {
        bestIndex = i
        bestScore = s
      }

      let verdict: String = (bestScore < confidenceThreshold) ? "YELLOW" : labels[bestIndex]

      respond([
        "verdict": verdict,
        "confidence": Double(bestScore),
        "scores": [
          "RED": Double(scores[0]),
          "GREEN": Double(scores[1]),
          "YELLOW": Double(scores[2]),
        ],
        "fingerprint": modelFingerprint,
      ])
    } catch {
      respond(fallback(reason: "inference_error:\(error)"))
    }
  }

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
        "fingerprint": modelFingerprint,
        "vocabFingerprint": vocabFingerprint,
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
    vocabFingerprint = sha256Hex(data)
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
    let url = URL(fileURLWithPath: path)
    let modelData: Data
    do {
      modelData = try Data(contentsOf: url)
    } catch {
      throw ScamDetectorError.loadFailed("cannot_read_model:\(error)")
    }
    guard modelData.count > 0 else {
      throw ScamDetectorError.loadFailed("empty_model_file")
    }
    modelFingerprint = sha256Hex(modelData)

    var options = Interpreter.Options()
    options.threadCount = 2
    let interp: Interpreter
    do {
      interp = try Interpreter(modelPath: path, options: options)
      try interp.allocateTensors()
    } catch {
      throw ScamDetectorError.loadFailed("interpreter_init:\(error)")
    }
    self.interpreter = interp
  }

  // MARK: - Tokenization

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

  // MARK: - Helpers

  private func fallback(reason: String) -> [String: Any] {
    return [
      "verdict": "YELLOW",
      "confidence": 0.0,
      "scores": ["RED": 0, "GREEN": 0, "YELLOW": 1],
      "error": reason,
      "fingerprint": modelFingerprint,
    ]
  }

  private func sha256Hex(_ data: Data) -> String {
    let digest = SHA256.hash(data: data)
    return digest.map { String(format: "%02x", $0) }.joined()
  }

  /// Blocks the current queue until at least `timingFloorMs` has elapsed.
  /// Keeps verdict latency constant so a passive observer can't infer
  /// the outcome from response time.
  private func enforceTimingFloor(since start: DispatchTime) {
    let elapsedNs = DispatchTime.now().uptimeNanoseconds &- start.uptimeNanoseconds
    let floorNs = timingFloorMs * 1_000_000
    if elapsedNs < floorNs {
      let remaining = floorNs - elapsedNs
      usleep(useconds_t(remaining / 1_000))
    }
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
