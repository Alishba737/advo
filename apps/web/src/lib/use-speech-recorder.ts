"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Microphone recorder that returns raw 16-bit mono PCM at 16 kHz
 * (the format the ADVO speech-to-text backend expects).
 *
 * Uses MediaRecorder to capture audio, then decodes + resamples to 16 kHz
 * using the Web Audio API so the output is correct regardless of the
 * device's native microphone sample rate.
 */
export function useSpeechRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    streamRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Voice input is not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(200); // collect chunks every 200ms
      setRecording(true);
    } catch (e) {
      cleanup();
      const message =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission denied — allow mic access to use voice input."
          : e instanceof Error
            ? e.message
            : "Could not access the microphone.";
      setError(message);
      throw new Error(message);
    }
  }, [cleanup]);

  const stop = useCallback(async (): Promise<ArrayBuffer | null> => {
    setRecording(false);
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    if (!recorder || !stream) {
      cleanup();
      return null;
    }

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];

        if (blob.size < 500) {
          cleanup();
          resolve(null);
          return;
        }

        try {
          const pcm = await decodeToPcm16(blob, 16000);
          cleanup();
          resolve(pcm);
        } catch (e) {
          cleanup();
          setError(e instanceof Error ? e.message : "Failed to process audio");
          resolve(null);
        }
      };
      recorder.stop();
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    setRecording(false);
    cleanup();
  }, [cleanup]);

  return { recording, error, start, stop, cancel };
}

/**
 * Decode a media Blob and resample it to target sample rate,
 * returning raw 16-bit little-endian mono PCM.
 */
async function decodeToPcm16(blob: Blob, targetSampleRate: number): Promise<ArrayBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const duration = decoded.duration;

    // Ignore taps shorter than ~0.3s
    if (duration < 0.3) {
      throw new Error("Audio too short");
    }

    // Resample to target rate using OfflineAudioContext
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.length * (targetSampleRate / decoded.sampleRate)), targetSampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const resampled = await offline.startRendering();

    // Trim leading ~0.25s (button click / connection noise)
    const samples = resampled.getChannelData(0);
    const leadSamples = Math.floor(targetSampleRate * 0.25);
    const trimmed = samples.slice(Math.min(leadSamples, samples.length));

    // Convert Float32 [-1, 1] -> Int16
    const pcm16 = new Int16Array(trimmed.length);
    for (let i = 0; i < trimmed.length; i++) {
      const s = Math.max(-1, Math.min(1, trimmed[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm16.buffer;
  } finally {
    await audioCtx.close();
  }
}
