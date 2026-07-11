/**
 * MelSpecLayerSimple — Custom TensorFlow.js layer required by the BirdNET model.
 * Computes mel spectrograms from raw audio inside the model graph.
 *
 * Also registers a custom STFT WebGL kernel for GPU-accelerated FFT.
 *
 * Based on BirdNET Real-Time PWA (MIT License)
 * Model: CC BY-SA 4.0 — Cornell Lab of Ornithology & Chemnitz University of Technology
 */

// ── Custom STFT WebGL Kernel ──────────────────────────────────────────────────

function registerSTFTKernel(tf) {
  // Stage 1: Windowing + bit-reversal reorder
  const windowAndBitReversalSource = `
    uniform float frameLength;
    uniform float frameStep;
    uniform float signalLength;

    float bitReverse(float x, float bits) {
      float result = 0.0;
      for (float i = 0.0; i < 16.0; i++) {
        if (i >= bits) break;
        result = result * 2.0 + mod(floor(x / pow(2.0, i)), 2.0);
      }
      return result;
    }

    void main() {
      ivec2 coords = getOutputCoords();
      int frame = coords[0];
      int bin = coords[1];
      int N = int(frameLength);
      float bits = log2(frameLength);

      int isReal = cyclemod(bin, 2);
      int halfBin = cyclemod(bin, N);

      float revIndex = bitReverse(float(halfBin), bits);
      int srcIndex = frame * int(frameStep) + int(revIndex);

      float val = 0.0;
      if (srcIndex < int(signalLength)) {
        val = getA(0, srcIndex);
      }
      // Apply Hann window
      float hann = 0.5 - 0.5 * cos(2.0 * 3.14159265359 * revIndex / (frameLength - 1.0));
      val *= hann;

      if (isReal == 1) {
        setOutput(0.0);
      } else {
        setOutput(val);
      }
    }
  `;

  // Stage 2: FFT butterfly passes
  const fftButterflySource = `
    uniform float passIndex;
    uniform float frameLength;

    void main() {
      ivec2 coords = getOutputCoords();
      int frame = coords[0];
      int idx = coords[1];

      int N2 = int(frameLength) * 2;
      int halfSize = int(pow(2.0, passIndex));
      int groupSize = halfSize * 2;

      int posInGroup = cyclemod(idx, groupSize * 2);
      int pairOffset = cyclemod(posInGroup, halfSize * 2);
      int isSecondHalf = cyclemod(pairOffset / (halfSize * 2), 2);

      int groupStart = idx - posInGroup;
      int k = cyclemod(pairOffset, halfSize * 2);
      int baseIdx = groupStart + k;

      float angle = -3.14159265359 * float(k / 2) / float(halfSize);
      float wr = cos(angle);
      float wi = sin(angle);

      float tr, ti, ur, ui;
      int evenIdx = cyclemod(baseIdx, N2);
      int oddIdx = cyclemod(baseIdx + halfSize * 2, N2);

      float er = getA(frame, evenIdx);
      float ei = getA(frame, evenIdx + 1);
      float or2 = getA(frame, oddIdx);
      float oi = getA(frame, oddIdx + 1);

      tr = wr * or2 - wi * oi;
      ti = wr * oi + wi * or2;

      int isImag = cyclemod(idx, 2);
      if (isSecondHalf == 0) {
        if (isImag == 0) {
          setOutput(er + tr);
        } else {
          setOutput(ei + ti);
        }
      } else {
        if (isImag == 0) {
          setOutput(er - tr);
        } else {
          setOutput(ei - ti);
        }
      }
    }
  `;

  // Stage 3: Extract real magnitudes from complex FFT
  const rfftOutputSource = `
    uniform float frameLength;

    void main() {
      ivec2 coords = getOutputCoords();
      int frame = coords[0];
      int bin = coords[1];

      int N = int(frameLength);
      int halfN = N / 2 + 1;

      if (bin >= halfN) {
        setOutput(0.0);
        return;
      }

      float re = getA(frame, bin * 2);
      float im = getA(frame, bin * 2 + 1);
      setOutput(sqrt(re * re + im * im));
    }
  `;

  // Helper to create WebGL program
  function makeProgram(source, inputShape, outputShape, uniforms) {
    return {
      variableNames: ['A'],
      outputShape: outputShape,
      userCode: source,
      customUniforms: uniforms
    };
  }

  // Register the STFT kernel
  tf.registerKernel({
    kernelName: 'STFT',
    backendName: 'webgl',
    kernelFunc: ({ inputs, backend, attrs }) => {
      const { signal } = inputs;
      const frameLength = attrs.frameLength || 2048;
      const frameStep = attrs.frameStep || 278;

      const signalShape = signal.shape;
      const signalLength = signalShape[signalShape.length - 1];
      const numFrames = Math.ceil((signalLength - frameLength) / frameStep) + 1;
      const N = frameLength;
      const complexN = N * 2;

      // Stage 1: Window + bit-reversal
      const stage1Program = makeProgram(
        windowAndBitReversalSource,
        [1, signalLength],
        [numFrames, complexN],
        [
          { name: 'frameLength', type: 'float', val: N },
          { name: 'frameStep', type: 'float', val: frameStep },
          { name: 'signalLength', type: 'float', val: signalLength }
        ]
      );
      let current = backend.compileAndRun(stage1Program, [signal]);

      // Stage 2: FFT butterfly passes
      const numPasses = Math.log2(N);
      for (let p = 0; p < numPasses; p++) {
        const butterflyProgram = makeProgram(
          fftButterflySource,
          [numFrames, complexN],
          [numFrames, complexN],
          [
            { name: 'passIndex', type: 'float', val: p },
            { name: 'frameLength', type: 'float', val: N }
          ]
        );
        const next = backend.compileAndRun(butterflyProgram, [current]);
        backend.disposeData(current.dataId);
        current = next;
      }

      // Stage 3: RFFT output (magnitudes)
      const halfN = Math.floor(N / 2) + 1;
      const rfftProgram = makeProgram(
        rfftOutputSource,
        [numFrames, complexN],
        [numFrames, halfN],
        [{ name: 'frameLength', type: 'float', val: N }]
      );
      const result = backend.compileAndRun(rfftProgram, [current]);
      backend.disposeData(current.dataId);

      return result;
    }
  });
}

// ── MelSpecLayerSimple Custom Keras Layer ─────────────────────────────────────

class MelSpecLayerSimple extends tf.layers.Layer {
  constructor(config) {
    super(config);
    this.sampleRate = config.sample_rate || config.sampleRate || 48000;
    this.specShape = config.spec_shape || config.specShape || [96, 512];
    this.frameStep = config.frame_step || config.frameStep || 278;
    this.frameLength = config.frame_length || config.frameLength || 2048;
    this.fmin = config.fmin || 0;
    this.fmax = config.fmax || 3000;
    this.melFilterbankData = config.mel_filterbank || config.melFilterbank;
  }

  build(inputShape) {
    // Create mel filterbank as a non-trainable weight
    if (this.melFilterbankData) {
      const fbData = Array.isArray(this.melFilterbankData) ? this.melFilterbankData : [];
      const rows = fbData.length;
      const cols = rows > 0 ? fbData[0].length : this.specShape[1];
      const flat = [];
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          flat.push(fbData[i][j]);
        }
      }
      this.melFilterbank = tf.tensor2d(flat, [rows, cols]);
    }

    // Magnitude scale (learnable parameter from the model)
    this.magScale = this.addWeight(
      'magnitude_scaling', [], 'float32',
      tf.initializers.zeros()
    );

    this.built = true;
  }

  call(inputs) {
    return tf.tidy(() => {
      const x = inputs[0] || inputs;
      const batchResults = [];
      const batchSize = x.shape[0];

      for (let b = 0; b < batchSize; b++) {
        let spec = x.slice([b, 0], [1, x.shape[1]]).squeeze();

        // Normalize to [-1, 1]
        spec = tf.sub(spec, tf.min(spec, -1, true));
        spec = tf.div(spec, tf.add(tf.max(spec, -1, true), 1e-6));
        spec = tf.sub(spec, 0.5).mul(2.0);

        // STFT via custom WebGL kernel
        spec = tf.engine().runKernel('STFT', {
          signal: spec.expandDims(0)
        }, {
          frameLength: this.frameLength,
          frameStep: this.frameStep
        });
        spec = spec.squeeze();

        // Apply mel filterbank and power
        if (this.melFilterbank) {
          spec = tf.matMul(spec, this.melFilterbank).pow(2.0);
        }

        // Magnitude scaling
        const magScaleVal = this.magScale.read();
        spec = spec.pow(tf.div(1.0, tf.add(1.0, tf.exp(magScaleVal))));

        // Flip and transpose to [freq, time, 1]
        spec = tf.reverse(spec, -1);
        spec = tf.transpose(spec).expandDims(-1);

        batchResults.push(spec);
      }

      return tf.stack(batchResults);
    });
  }

  getConfig() {
    const config = super.getConfig();
    config.sample_rate = this.sampleRate;
    config.spec_shape = this.specShape;
    config.frame_step = this.frameStep;
    config.frame_length = this.frameLength;
    config.fmin = this.fmin;
    config.fmax = this.fmax;
    return config;
  }

  static get className() {
    return 'MelSpecLayerSimple';
  }

  computeOutputShape(inputShape) {
    return [inputShape[0], this.specShape[1], this.specShape[0], 1];
  }
}

// Export for use in worker
if (typeof self !== 'undefined') {
  self.MelSpecLayerSimple = MelSpecLayerSimple;
  self.registerSTFTKernel = registerSTFTKernel;
}
