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
  tf.registerKernel({
    kernelName: 'STFT',
    backendName: 'webgl',
    kernelFunc: ({ backend, inputs: { signal, frameLength, frameStep } }) => {
      const innerDim = frameLength / 2;
      const batch = (signal.shape[signal.shape.length - 1] - frameLength + frameStep) / frameStep | 0;

      // Stage 1: Windowing & Bit-Reversal
      let currentTensor = backend.runWebGLProgram({
        variableNames: ['x'],
        outputShape: [batch, frameLength],
        userCode: `void main(){
          ivec2 c=getOutputCoords();
          int p=c[1]%${innerDim};
          int k=0;
          for(int i=0;i<${Math.log2(innerDim)};++i){
            if((p & (1<<i))!=0){ k|=(1<<(${Math.log2(innerDim) - 1}-i)); }
          }
          int i=2*k;
          if(c[1]>=${innerDim}){ i=2*(k%${innerDim})+1; }
          int q=c[0]*${frameLength}+i;
          float val=getX((q/${frameLength})*${frameStep}+ q % ${frameLength});
          float cosArg=${2.0 * Math.PI / frameLength}*float(q);
          float mul=0.5-0.5*cos(cosArg);
          setOutput(val*mul);
        }`
      }, [signal], 'float32');

      // Stage 2: FFT Butterflies
      for (let len = 1; len < innerDim; len *= 2) {
        let prevTensor = currentTensor;
        currentTensor = backend.runWebGLProgram({
          variableNames: ['x'],
          outputShape: [batch, innerDim * 2],
          userCode: `void main(){
            ivec2 c=getOutputCoords();
            int b=c[0];
            int i=c[1];
            int k=i%${innerDim};
            int isHigh=(k%${len * 2})/${len};
            int highSign=(1 - isHigh*2);
            int baseIndex=k - isHigh*${len};
            float t=${Math.PI / len}*float(k%${len});
            float a=cos(t);
            float bsin=sin(-t);
            float oddK_re=getX(b, baseIndex+${len});
            float oddK_im=getX(b, baseIndex+${len + innerDim});
            if(i<${innerDim}){
              float evenK_re=getX(b, baseIndex);
              setOutput(evenK_re + (oddK_re*a - oddK_im*bsin)*float(highSign));
            } else {
              float evenK_im=getX(b, baseIndex+${innerDim});
              setOutput(evenK_im + (oddK_re*bsin + oddK_im*a)*float(highSign));
            }
          }`
        }, [prevTensor], 'float32');
        backend.disposeIntermediateTensorInfo(prevTensor);
      }

      // Stage 3: Real RFFT Output
      const real = backend.runWebGLProgram({
        variableNames: ['x'],
        outputShape: [batch, innerDim + 1],
        userCode: `void main(){
          ivec2 c=getOutputCoords();
          int b=c[0];
          int i=c[1];
          int zI=i%${innerDim};
          int conjI=(${innerDim}-i)%${innerDim};
          float Zk0=getX(b,zI);
          float Zk1=getX(b,zI+${innerDim});
          float Zk_conj0=getX(b,conjI);
          float Zk_conj1=-getX(b,conjI+${innerDim});
          float t=${-2.0 * Math.PI}*float(i)/float(${innerDim * 2});
          float diff0=Zk0 - Zk_conj0;
          float diff1=Zk1 - Zk_conj1;
          float result=(Zk0+Zk_conj0 + cos(t)*diff1 + sin(t)*diff0)*0.5;
          setOutput(result);
        }`
      }, [currentTensor], 'float32');
      backend.disposeIntermediateTensorInfo(currentTensor);
      return real;
    }
  });
}

// ── MelSpecLayerSimple Custom Keras Layer ─────────────────────────────────────

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
        spec = tf.sub(spec, tf.min(spec, -1, true));
        spec = tf.div(spec, tf.max(spec, -1, true).add(1e-6));
        spec = tf.sub(spec, 0.5).mul(2.0);

        spec = tf.engine().runKernel('STFT', {
          signal: spec,
          frameLength: this.frameLength,
          frameStep: this.frameStep
        });

        spec = tf.matMul(spec, this.melFilterbank).pow(2.0);
        spec = spec.pow(tf.div(1.0, tf.add(1.0, tf.exp(this.magScale.read()))));

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
  self.registerSTFTKernel = registerSTFTKernel;
}
