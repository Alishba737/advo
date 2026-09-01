"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Microphone recorder that captures raw 16-bit mono PCM at 16 kHz
 * (the format the ADVO speech-to-text backend expects).
 *
 * Uses getUserMedia + a ScriptProcessorNode to convert Float32 → Int16.
 * (AudioWorklet would be the modern choice but needs a separate module
 * file; ScriptProcessor is deprecated yet universally supported.)
 */
export function useSpeechRecorder() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioCtxRef.current?.close();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          // clamp + convert Float32 [-1, 1] to Int16
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        chunksRef.current.push(pcm16);
      };

      source.connect(processor);
      // ScriptProcessor needs a destination to pull samples on some browsers
      processor.connect(ctx.destination);

      setRecording(true);
    } catch (e) {
      cleanup();
      const message =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone permission denied — allow mic access to use voice input."
          : `Could not access the microphone: ${e instanceof Error ? e.message : String(e)}`;
      setError(message);
      throw new Error(message);
    }
  }, [cleanup]);

  /** Stop recording and return the captured PCM bytes (or null if too short). */
  const stop = useCallback((): ArrayBuffer | null => {
    setRecording(false);
    // Trim the leading ~0.25s — the stream-connect click often reads as
    // speech and makes the ASR hallucinate words at the start.
    const leadSamples = 16000 * 0.25;
    let chunks = chunksRef.current;
    let trimmed = 0;
    while (chunks.length && trimmed + chunks[0].length <= leadSamples) {
      trimmed += chunks[0].length;
      chunks = chunks.slice(1);
    }
    if (chunks.length && trimmed < leadSamples) {
      const skip = Math.floor(leadSamples - trimmed);
      chunks = [chunks[0].slice(skip), ...chunks.slice(1)];
    }
    chunksRef.current = chunks;

    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    // ignore taps shorter than ~0.3s after trimming
    if (total < 16000 * 0.3) {
      cleanup();
      return null;
    }
    const merged = new Int16Array(total);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    cleanup();
    return merged.buffer;
  }, [cleanup]);

  /** Cancel recording without returning audio. */
  const cancel = useCallback(() => {
    setRecording(false);
    chunksRef.current = [];
    cleanup();
  }, [cleanup]);

  return { recording, error, start, stop, cancel };
}
