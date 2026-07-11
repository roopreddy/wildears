/**
 * BirdNET Web Worker — Loads the TensorFlow.js model and runs inference
 * off the main thread so the UI stays responsive.
 *
 * Messages IN:
 *   { type: 'init' }                           → load model + labels
 *   { type: 'predict', audio: Float32Array }    → run inference on audio
 *
 * Messages OUT:
 *   { type: 'init_progress', progress: 0-100 }
 *   { type: 'init_done' }
 *   { type: 'init_error', error: string }
 *   { type: 'results', detections: [...] }
 *   { type: 'predict_error', error: string }
 */

const MODEL_URL = 'https://birdnet-team.github.io/real-time-pwa/models/birdnet/model.json';
const LABELS_URL = 'https://birdnet-team.github.io/real-time-pwa/models/birdnet/labels/en_us.txt';
const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/dist/tf.min.js';
const SAMPLE_RATE = 48000;
const WINDOW_SECONDS = 3;
const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS; // 144,000
const DEFAULT_THRESHOLD = 0.1;

let birdModel = null;
let labelsList = [];
let isReady = false;

// ── Load dependencies and initialize ──────────────────────────────────────────

async function initialize() {
  try {
    postMessage({ type: 'init_progress', progress: 5, status: 'Loading TensorFlow.js...' });

    // Load TensorFlow.js
    importScripts(TF_URL);

    postMessage({ type: 'init_progress', progress: 15, status: 'Setting up audio processing...' });

    // Load and register the custom MelSpecLayer
    importScripts('mel-spec-layer.js');
    tf.serialization.registerClass(MelSpecLayerSimple);

    // Use CPU backend in worker (WebGL is unreliable in Web Workers)
    await tf.setBackend('cpu');
    await tf.ready();

    postMessage({ type: 'init_progress', progress: 25, status: 'Loading BirdNET model...' });

    // Load the BirdNET model
    birdModel = await tf.loadLayersModel(MODEL_URL, {
      onProgress: (fraction) => {
        const progress = 25 + Math.floor(fraction * 55);
        postMessage({ type: 'init_progress', progress, status: 'Downloading model...' });
      }
    });

    postMessage({ type: 'init_progress', progress: 85, status: 'Loading species labels...' });

    // Warmup inference
    tf.tidy(() => {
      birdModel.predict(tf.zeros([1, WINDOW_SAMPLES]));
    });

    postMessage({ type: 'init_progress', progress: 90, status: 'Loading species list...' });

    // Load labels
    const labelsText = await fetch(LABELS_URL).then(r => r.text());
    labelsList = labelsText.trim().split('\n').map(line => {
      const parts = line.split('_');
      return {
        scientificName: parts[0],
        commonName: parts.slice(1).join(' ')
      };
    });

    isReady = true;
    postMessage({ type: 'init_progress', progress: 100, status: 'Ready!' });
    postMessage({ type: 'init_done', speciesCount: labelsList.length });

  } catch (err) {
    postMessage({ type: 'init_error', error: err.message || String(err) });
  }
}

// ── Run inference ─────────────────────────────────────────────────────────────

async function predict(audioData, threshold) {
  if (!isReady || !birdModel) {
    postMessage({ type: 'predict_error', error: 'Model not loaded yet' });
    return;
  }

  try {
    const minThreshold = threshold || DEFAULT_THRESHOLD;

    // Ensure audio is the right length (pad or trim to 3 seconds)
    let samples = new Float32Array(WINDOW_SAMPLES);
    if (audioData.length >= WINDOW_SAMPLES) {
      // Take the middle 3-second chunk if longer
      const start = Math.floor((audioData.length - WINDOW_SAMPLES) / 2);
      samples.set(audioData.subarray(start, start + WINDOW_SAMPLES));
    } else {
      // Pad with zeros if shorter
      samples.set(audioData);
    }

    // Clamp to [-1, 1]
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.max(-1, Math.min(1, samples[i]));
    }

    // Run inference
    const inputTensor = tf.tensor2d(samples, [1, WINDOW_SAMPLES]);
    const outputTensor = birdModel.predict(inputTensor);
    const predictions = await outputTensor.array();

    // Clean up tensors
    inputTensor.dispose();
    outputTensor.dispose();

    // Extract detections above threshold
    const scores = predictions[0];
    const detections = [];

    for (let i = 0; i < scores.length; i++) {
      if (scores[i] >= minThreshold && i < labelsList.length) {
        detections.push({
          index: i,
          scientificName: labelsList[i].scientificName,
          commonName: labelsList[i].commonName,
          confidence: scores[i]
        });
      }
    }

    // Sort by confidence descending, take top 10
    detections.sort((a, b) => b.confidence - a.confidence);
    const topDetections = detections.slice(0, 10);

    postMessage({ type: 'results', detections: topDetections });

  } catch (err) {
    postMessage({ type: 'predict_error', error: err.message || String(err) });
  }
}

// ── Handle messages from main thread ──────────────────────────────────────────

self.onmessage = function(e) {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      initialize();
      break;

    case 'predict':
      predict(msg.audio, msg.threshold);
      break;

    default:
      console.warn('Worker: unknown message type', msg.type);
  }
};
