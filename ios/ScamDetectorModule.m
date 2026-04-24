// ScamDetectorModule.m
//
// Objective-C bridge that exposes the Swift `ScamDetectorModule` class
// to React Native. React Native discovers native modules through these
// RCT_EXTERN_MODULE / RCT_EXTERN_METHOD macros, so the Swift implementation
// does not need any @objc bridging at the Method Dispatch level beyond
// the @objc annotations already present in ScamDetectorModule.swift.

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ScamDetector, NSObject)

// Run the bag-of-words classifier against a transcript and resolve with
// a dictionary: { verdict, confidence, scores, error? }.
RCT_EXTERN_METHOD(analyze:(NSString *)transcript
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Diagnostics for the JS layer: reports whether the .tflite + vocab.json
// bundled resources were found and the interpreter initialised.
RCT_EXTERN_METHOD(isReady:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
