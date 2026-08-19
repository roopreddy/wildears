/**
 * MammalIdentifier — Bridge between the main thread and mammal-worker.js.
 * Lazy-initializes the YAMNet + classifier pipeline only when first needed.
 *
 * Messages to worker:  { type: 'init' }  |  { type: 'predict', audio: Float32Array }
 * Messages from worker: progress / ready / result / error
 */
const MammalIdentifier = (() => {
  let worker   = null;
  let _ready   = false;
  let _loading = false;
  let cb = { onProgress: () => {}, onReady: () => {}, onError: () => {}, onResults: () => {} };

  function init({ onProgress, onReady, onError, onResults } = {}) {
    // Update callbacks (works whether first call or re-registration)
    cb = {
      onProgress: onProgress || (() => {}),
      onReady:    onReady    || (() => {}),
      onError:    onError    || (() => {}),
      onResults:  onResults  || (() => {}),
    };

    if (worker) {
      // Already started — fire onReady immediately if already loaded
      if (_ready) cb.onReady();
      return;
    }

    _loading = true;
    worker = new Worker('js/mammal-worker.js');

    worker.onmessage = ({ data: msg }) => {
      switch (msg.type) {
        case 'progress':
          cb.onProgress(msg.percent || 0, msg.message);
          break;
        case 'ready':
          _ready = true;
          _loading = false;
          cb.onReady();
          break;
        case 'result':
          cb.onResults(msg.detections);
          break;
        case 'error':
          _loading = false;
          cb.onError(msg.message);
          break;
      }
    };

    worker.onerror = (err) => {
      _loading = false;
      cb.onError('Mammal worker error: ' + (err.message || 'Unknown'));
    };

    worker.postMessage({ type: 'init' });
  }

  function identify(audioFloat32Array) {
    if (!_ready || !worker) return;
    worker.postMessage({ type: 'predict', audio: audioFloat32Array });
  }

  function ready()   { return _ready; }
  function loading() { return _loading; }

  return { init, identify, ready, loading };
})();
