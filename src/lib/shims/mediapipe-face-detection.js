// Shim for `@mediapipe/face_detection`.
//
// The collage-creator tool only ever uses the TensorFlow.js runtime
// (`createDetector(..., { runtime: "tfjs" })`), so the MediaPipe solution class
// is never instantiated. The real package ships a UMD bundle that exposes no
// static `FaceDetection` export, which breaks rolldown's static analysis under
// Vite 8. Aliasing to this shim satisfies the named import and drops the unused
// MediaPipe dependency from the bundle.
export class FaceDetection {
	constructor() {
		throw new Error(
			"@mediapipe/face_detection is shimmed out; only the tfjs face-detection runtime is supported.",
		);
	}
}

export default { FaceDetection };
