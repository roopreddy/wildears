/**
 * Identifier — Bridge between the main thread and the BirdNET Web Worker.
 * Handles model initialization, audio submission, and result callbacks.
 */
const Identifier = (() => {
  let worker = null;
  let onProgress = null;
  let onReady = null;
  let onError = null;
  let onResults = null;
  let isModelReady = false;

  function init({ onProgress: progressCb, onReady: readyCb, onError: errorCb, onResults: resultsCb }) {
    onProgress = progressCb || (() => {});
    onReady = readyCb || (() => {});
    onError = errorCb || (() => {});
    onResults = resultsCb || (() => {});

    // Create the worker
    worker = new Worker('js/birdnet-worker.js');

    worker.onmessage = (e) => {
      const msg = e.data;
      switch (msg.type) {
        case 'init_progress':
          onProgress(msg.progress, msg.status);
          break;
        case 'init_done':
          isModelReady = true;
          onReady(msg.speciesCount);
          break;
        case 'init_error':
          onError('Model failed to load: ' + msg.error);
          break;
        case 'results':
          onResults(msg.detections);
          break;
        case 'predict_error':
          onError('Identification failed: ' + msg.error);
          break;
      }
    };

    worker.onerror = (err) => {
      onError('Worker error: ' + (err.message || 'Unknown error'));
    };

    // Start loading the model
    worker.postMessage({ type: 'init' });
  }

  function identify(audioFloat32Array, threshold) {
    if (!worker) {
      onError('Identifier not initialized');
      return;
    }
    if (!isModelReady) {
      onError('Model is still loading, please wait...');
      return;
    }
    worker.postMessage({
      type: 'predict',
      audio: audioFloat32Array,
      threshold: threshold || 0.1
    });
  }

  function ready() {
    return isModelReady;
  }

  return { init, identify, ready };
})();
