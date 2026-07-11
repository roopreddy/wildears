/**
 * MelSpecLayerSimple — Custom TensorFlow.js layer required by the BirdNET model.
 * Computes mel spectrograms from raw audio inside the model graph.
 *
 * Uses built-in TF.js ops (tf.signal.frame, tf.signal.hannWindow, tf.spectral.rfft)
 * instead of custom WebGL shaders, so it works on ALL backends (CPU, WebGL, WASM).
 *
 * Based on BirdNET Real-Time PWA (MIT License)
 * Model: CC BY-SA 4.0 — Cornell Lab of Ornithology & Chemnitz University of Technology
 */

class MelSpecLayerSimple extends tf.layers.Layer {
  constructor(config) {
    super(config);
    this.sampleRate = config.sampleRate;
    this.specShape = config.specShape;
    this.frameStep = config.frameStep;
    this.frameLength = config.frameLength;
    this.melFilterbank = tf.tensor2d(config.melFilterbank);
  }

  build() {
    this.magScale = this.addWeight(
      'magnitude_scaling', [], 'float32',
      tf.initializers.constant({ value: 1.23 })
    );
    super.build();
  }

  computeOutputShape(inputShape) {
    return [inputShape[0], this.specShape[0], this.specShape[1], 1];
  }

  call(inputs) {
    return tf.tidy(() => {
      const x = inputs[0];
      return tf.stack(x.split(x.shape[0]).map(input => {
        let spec = input.squeeze();

        // Normalize to [-1, 1]
        spec = tf.sub(spec, tf.min(spec, -1, true));
        spec = tf.div(spec, tf.max(spec, -1, true).add(1e-6));
        spec = tf.sub(spec, 0.5).mul(2.0);

        // STFT using built-in TF.js ops (works on any backend)
        const frames = tf.signal.frame(spec, this.frameLength, this.frameStep);
        const window = tf.signal.hannWindow(this.frameLength);
        const windowedFrames = frames.mul(window);
        const fft = tf.spectral.rfft(windowedFrames);
        spec = tf.abs(fft);

        // Apply mel filterbank and power
        spec = tf.matMul(spec, this.melFilterbank).pow(2.0);
        spec = spec.pow(tf.div(1.0, tf.add(1.0, tf.exp(this.magScale.read()))));

        // Flip and transpose to [freq, time, 1]
        spec = tf.reverse(spec, -1);
        spec = tf.transpose(spec).expandDims(-1);
        return spec;
      }));
    });
  }

  static get className() {
    return 'MelSpecLayerSimple';
  }
}

// Export for use in worker
if (typeof self !== 'undefined') {
  self.MelSpecLayerSimple = MelSpecLayerSimple;
}
