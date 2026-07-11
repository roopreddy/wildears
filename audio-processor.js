/**
 * AudioWorklet processor for buffering microphone audio.
 * Runs in the audio rendering thread — lightweight, no heavy processing.
 * Buffers 2048 samples and posts them to the main thread.
 */
class WildEarsAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this._buffer = new Float32Array(this.bufferSize);
    this._index = 0;
  }

  process(inputs) {
    const channelData = inputs[0]?.[0];
    if (!channelData) return true;

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._index++] = channelData[i];
      if (this._index >= this.bufferSize) {
        this.port.postMessage(this._buffer.slice());
        this._index = 0;
      }
    }
    return true;
  }
}

registerProcessor('wildears-audio-processor', WildEarsAudioProcessor);
