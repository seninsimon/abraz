/**
 * useScreenCapture hook.
 * 
 * Manages screen share MediaStream acquisition via getDisplayMedia.
 * Handles user cancellation and permission errors gracefully.
 */

import { useState, useCallback, useRef } from 'react';

interface UseScreenCaptureReturn {
  /** The screen share MediaStream */
  stream: MediaStream | null;
  /** Whether screen sharing is currently active */
  isActive: boolean;
  /** Error message if permission denied or sharing cancelled */
  error: string | null;
  /** Start screen sharing (opens browser picker) */
  start: () => Promise<void>;
  /** Stop screen sharing and release the stream */
  stop: () => void;
}

/**
 * Hook to capture the user's screen via getDisplayMedia.
 * Handles the browser-native screen picker dialog and graceful cancellation.
 */
export function useScreenCapture(): UseScreenCaptureReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    try {
      setError(null);

      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: true, // System audio (if supported)
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsActive(true);

      // Handle user clicking "Stop sharing" in the browser's built-in UI
      mediaStream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          console.log('[ScreenCapture] User stopped sharing');
          setIsActive(false);
          setStream(null);
          streamRef.current = null;
        });
      });
    } catch (err) {
      const error = err as DOMException;
      console.error('[ScreenCapture] Error:', error.name, error.message);

      switch (error.name) {
        case 'NotAllowedError':
          // User cancelled the screen picker dialog — this is normal, not an error
          setError('Screen sharing was cancelled or denied.');
          break;
        case 'NotFoundError':
          setError('No screen sharing source found.');
          break;
        case 'NotReadableError':
          setError('Screen capture failed. The source may be restricted.');
          break;
        case 'AbortError':
          setError('Screen sharing was aborted.');
          break;
        default:
          setError(`Unexpected error: ${error.message}`);
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
