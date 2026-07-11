/**
 * Recorder — Handles microphone recording and audio file uploads.
 * Captures audio at 48kHz and provides Float32Array buffers for identification.
 */
const Recorder = (() => {
  const SAMPLE_RATE = 48000;
  const WINDOW_SECONDS = 3;
  const WINDOW_SAMPLES = SAMPLE_RATE * WINDOW_SECONDS;

  let audioContext = null;
  let sourceNode = null;
  let workletNode = null;
  let stream = null;
  let isRecording = false;

  // Circular buffer for live recording
  let circularBuffer = new Float32Array(WINDOW_SAMPLES);
  let writePos = 0;
  let samplesCollected = 0;

  // ── Live Recording ────────────────────────────────────────────────────────

  async function startRecording(onBufferReady) {
    if (isRecording) return;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

      // Register the AudioWorklet processor
      await audioContext.audioWorklet.addModule('audio-processor.js');

      sourceNode = audioContext.createMediaStreamSource(stream);
      workletNode = new AudioWorkletNode(audioContext, 'wildears-audio-processor');

      workletNode.port.onmessage = (e) => {
        const samples = e.data;
        for (let i = 0; i < samples.length; i++) {
          circularBuffer[writePos] = samples[i];
          writePos = (writePos + 1) % WINDOW_SAMPLES;
          samplesCollected++;
        }
      };

      sourceNode.connect(workletNode);
      workletNode.connect(audioContext.destination);

      isRecording = true;
      circularBuffer.fill(0);
      writePos = 0;
      samplesCollected = 0;

    } catch (err) {
      throw new Error(
        err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone access and try again.'
          : 'Could not start recording: ' + err.message
      );
    }
  }

  function stopRecording() {
    if (!isRecording) return null;

    isRecording = false;

    // Disconnect audio nodes
    if (workletNode) {
      workletNode.disconnect();
      workletNode = null;
    }
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    // Extract the buffer (unwind circular buffer to linear)
    const result = new Float32Array(WINDOW_SAMPLES);
    if (samplesCollected >= WINDOW_SAMPLES) {
      // Full buffer — read from writePos (oldest) to writePos-1 (newest)
      for (let i = 0; i < WINDOW_SAMPLES; i++) {
        result[i] = circularBuffer[(writePos + i) % WINDOW_SAMPLES];
      }
    } else {
      // Partial buffer — just copy what we have
      result.set(circularBuffer.subarray(0, samplesCollected));
    }

    return result;
  }

  function getRecordingState() {
    return isRecording;
  }

  function getRecordedDuration() {
    if (!isRecording) return 0;
    return Math.min(samplesCollected / SAMPLE_RATE, WINDOW_SECONDS);
  }

  // ── File Upload Processing ────────────────────────────────────────────────

  async function processFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          // Decode audio to raw PCM
          const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
          const audioBuffer = await ctx.decodeAudioData(e.target.result);

          // Get mono channel data
          const channelData = audioBuffer.getChannelData(0);

          // If the file's sample rate differs, AudioContext already resampled to SAMPLE_RATE
          // Just need to ensure we have the right number of samples
          let samples;
          if (channelData.length >= WINDOW_SAMPLES) {
            // For longer files, process multiple 3-second windows
            // For now, take the chunk with the most energy (likely has the call)
            samples = findBestChunk(channelData);
          } else {
            // Pad short audio with zeros
            samples = new Float32Array(WINDOW_SAMPLES);
            samples.set(channelData);
          }

          ctx.close();
          resolve({
            samples,
            duration: audioBuffer.duration,
            originalLength: channelData.length
          });
        } catch (err) {
          reject(new Error('Could not decode audio file: ' + err.message));
        }
      };

      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  // Find the 3-second chunk with the most energy (most likely to contain a call)
  function findBestChunk(channelData) {
    const hopSize = SAMPLE_RATE; // 1 second hop
    let bestStart = 0;
    let bestEnergy = 0;

    for (let start = 0; start + WINDOW_SAMPLES <= channelData.length; start += hopSize) {
      let energy = 0;
      for (let i = start; i < start + WINDOW_SAMPLES; i += 100) {
        energy += channelData[i] * channelData[i];
      }
      if (energy > bestEnergy) {
        bestEnergy = energy;
        bestStart = start;
      }
    }

    return channelData.slice(bestStart, bestStart + WINDOW_SAMPLES);
  }

  return {
    startRecording,
    stopRecording,
    getRecordingState,
    getRecordedDuration,
    processFile,
    SAMPLE_RATE,
    WINDOW_SECONDS
  };
})();
