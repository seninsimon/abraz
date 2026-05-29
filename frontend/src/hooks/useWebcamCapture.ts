/**
 * useWebcamCapture hook.
 * 
 * Manages webcam MediaStream acquisition via getUserMedia.
 * Handles permission denial and device-not-found errors gracefully.
 */

import { useState, useCallback, useRef } from 'react';

interface UseWebcamCaptureReturn {
  /** The raw webcam MediaStream (before timestamp overlay) */
  stream: MediaStream | null;
  /** Whether the webcam is currently active */
  isActive: boolean;
  /** Error message if permission denied or device unavailable */
  error: string | null;
  /** Start capturing from the webcam */
  start: () => Promise<void>;
  /** Stop the webcam and release the media stream */
  stop: () => void;
}

/**
 * Hook to capture webcam video and audio.
 * Returns the raw stream, which should be passed through TimestampCanvas
 * before being sent over WebRTC.
 */
export function useWebcamCapture(): UseWebcamCaptureReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    try {
      setError(null);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsActive(true);

      // Handle track ending (e.g., user revokes permission via browser UI)
      mediaStream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          console.log(`[Webcam] Track ended: ${track.kind}`);
          setIsActive(false);
          setStream(null);
          streamRef.current = null;
        });
      });
    } catch (err) {
      const error = err as DOMException;
      console.error('[Webcam] Error:', error.name, error.message);

      switch (error.name) {
        case 'NotAllowedError':
          setError('Camera permission was denied. Please allow camera access and try again.');
          break;
        case 'NotFoundError':
          setError('No camera found. Please connect a camera and try again.');
          break;
        case 'NotReadableError':
          setError('Camera is in use by another application. Please close it and try again.');
          break;
        case 'OverconstrainedError':
          setError('Camera does not meet the required constraints. Trying with lower settings...');
          // Retry with minimal constraints
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
            streamRef.current = fallbackStream;
            setStream(fallbackStream);
            setIsActive(true);
            setError(null);
          } catch {
            setError('Failed to access camera even with minimal settings.');
          }
          break;
        default:
          setError(`Unexpected error accessing camera: ${error.message}`);
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsActive(false);
    setError(null);
  }, []);

  return { stream, isActive, error, start, stop };
}
