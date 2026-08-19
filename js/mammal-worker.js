/**
 * mammal-worker.js — Web Worker for Sacramento mammal sound identification.
 *
 * Pipeline (mirrors birdnet-worker.js but for mammals):
 *   Audio (16kHz) → YAMNet (Google, TF Hub TF.js) → mean embeddings
 *                → Our classifier (fine-tuned, ~500KB) → species probs
 *
 * Messages IN:
 *   { type: 'init' }
 *   { type: 'predict', audio: Float32Array }  // 16kHz mono, 3s = 48,000 samples
 *
 * Messages OUT:
 *   { type: 'progress', message: string, percent: number }
 *   { type: 'ready' }
 *   { type: 'result', detections: [ { commonName, scientificName, confidence, status, ... } ] }
 *   { type: 'error', message: string }
 */

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.14.0/dist/tf.min.js');

const YAMNET_URL      = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';
const CLASSIFIER_URL  = '/wildears/mammal-model/model/tfjs/model.json';
const LABELS_URL      = '/wildears/mammal-model/model/tfjs/labels.json';
const CONFIDENCE_THRESHOLD = 0.40;

let yamnet     = null;
let classifier = null;
let labels     = null;

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    await tf.setBackend('cpu');
    await tf.ready();

    // 1. Load YAMNet (Google's audio feature extractor)
    postMessage({ type: 'progress', message: 'Loading YAMNet audio model...', percent: 10 });
    yamnet = await tf.loadGraphModel(YAMNET_URL, { fromTFHub: true });

    // 2. Load our mammal classifier
    postMessage({ type: 'progress', message: 'Loading mammal classifier...', percent: 60 });
    classifier = await tf.loadLayersModel(CLASSIFIER_URL);

    // 3. Load species labels
    postMessage({ type: 'progress', message: 'Loading species database...', percent: 85 });
    const resp = await fetch(LABELS_URL);
    labels = await resp.json();

    // 4. Warmup run
    postMessage({ type: 'progress', message: 'Warming up...', percent: 95 });
    const warmup = tf.zeros([48000]);
    const emb    = await getEmbedding(warmup);
    classifier.predict(emb.expandDims(0));
    warmup.dispose();
    emb.dispose();

    postMessage({ type: 'ready' });
  } catch (err) {
    postMessage({ type: 'error', message: `Init failed: ${err.message}` });
  }
}

// ── Embedding Extraction ───────────────────────────────────────────────────

async function getEmbedding(audioTensor) {
  /**
   * Run audio through YAMNet and return mean-pooled 1024-dim embedding.
   * YAMNet expects float32 audio at 16kHz, values in [-1, 1].
   */
  return tf.tidy(() => {
    // YAMNet returns [scores, embeddings, spectrogram]
    const [, embeddings] = yamnet.predict(audioTensor);
    // Mean pool across time frames → (1024,)
    return tf.mean(embeddings, 0);
  });
}

// ── Prediction ─────────────────────────────────────────────────────────────

async function predict(audioFloat32) {
  if (!yamnet || !classifier || !labels) {
    postMessage({ type: 'error', message: 'Model not ready yet.' });
    return;
  }

  try {
    const results = await tf.tidy(() => {
      const audio = tf.tensor1d(audioFloat32);

      // Normalize to [-1, 1]
      const peak = tf.max(tf.abs(audio));
      const norm = tf.div(audio, tf.maximum(peak, 1e-6));

      return norm;
    });

    // Extract YAMNet embedding
    const embedding = await getEmbedding(results);
    results.dispose();

    // Run our classifier
    const probTensor = classifier.predict(embedding.expandDims(0));
    const probs      = await probTensor.data();
    probTensor.dispose();
    embedding.dispose();

    // Map to species detections
    const detections = labels
      .map((sp, i) => ({ ...sp, confidence: probs[i] }))
      .filter(d => d.confidence >= CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 1);

    postMessage({ type: 'result', detections });
  } catch (err) {
    postMessage({ type: 'error', message: `Prediction failed: ${err.message}` });
  }
}

// ── Message Handler ────────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { type, audio } = e.data;
  if (type === 'init')    await init();
  if (type === 'predict') await predict(audio);
};
