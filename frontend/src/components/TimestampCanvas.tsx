/**
 * TimestampCanvas component.
 * 
 * Takes a raw webcam MediaStream, draws each frame onto a hidden canvas,
 * overlays the current time in HH:MM:SS format, and outputs a new
 * MediaStream via captureStream(). This "stamped" stream is what gets
 * sent over WebRTC, so the host sees the timestamp burned into the video.
 * 
 * Implementation details:
 * - Uses requestAnimationFrame for smooth, vsync'd rendering
 * - Canvas dimensions match the source video track's settings
 * - Timestamp is rendered with a semi-transparent background for readability
 * - The output stream is created via canvas.captureStream(30) at 30fps
 */

import { useEffect, useRef, useCallback } from 'react';
import type { TimestampCanvasProps } from '../types';
import { formatTimestamp } from '../utils/time';

export function TimestampCanvas({
  sourceStream,
  onStampedStream,
  className = '',
}: TimestampCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number>(0);
  const stampedStreamRef = useRef<MediaStream | null>(null);

  /**
   * Core rendering loop: draws each video frame onto the canvas
   * with a timestamp overlay, running at display refresh rate.
   */
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.paused || video.ended) {
      animationFrameRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw the current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // --- Timestamp overlay ---
    const timestamp = formatTimestamp();
    const fontSize = Math.max(16, Math.floor(canvas.height / 20));
    ctx.font = `bold ${fontSize}px "Inter", "SF Mono", monospace`;

    // Measure text for background sizing
    const textMetrics = ctx.measureText(timestamp);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;
    const padding = 8;
    const margin = 16;

    // Position: bottom-right corner
    const x = canvas.width - textWidth - padding * 2 - margin;
    const y = canvas.height - textHeight - padding * 2 - margin;

    // Semi-transparent dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(x, y, textWidth + padding * 2, textHeight + padding * 2, 6);
    ctx.fill();

    // White timestamp text
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'top';
    ctx.fillText(timestamp, x + padding, y + padding);

    // Schedule next frame
    animationFrameRef.current = requestAnimationFrame(renderFrame);
  }, []);

  /**
   * Set up the canvas pipeline when the source stream changes:
   * 1. Attach source to hidden video element
   * 2. Size canvas to match video dimensions
   * 3. Start render loop
   * 4. Create output MediaStream via captureStream()
   */
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !sourceStream) return;

    // Attach source stream to the hidden video element
    video.srcObject = sourceStream;
    video.play().catch(console.error);

    const handleLoadedMetadata = () => {
      // Size the canvas to match the video dimensions
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      // Start the rendering loop
      animationFrameRef.current = requestAnimationFrame(renderFrame);

      // Create the stamped output stream from the canvas
      const stamped = canvas.captureStream(30);

      // Preserve audio tracks from the original stream
      // (captureStream only captures video from the canvas)
      sourceStream.getAudioTracks().forEach((audioTrack) => {
        stamped.addTrack(audioTrack);
      });

      stampedStreamRef.current = stamped;
      onStampedStream(stamped);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      cancelAnimationFrame(animationFrameRef.current);
      video.srcObject = null;
    };
  }, [sourceStream, onStampedStream, renderFrame]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <div className={`timestamp-canvas-wrapper ${className}`}>
      {/* Hidden video element for reading source frames */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* Canvas where frames are drawn with timestamp */}
      <canvas
        ref={canvasRef}
        className="timestamp-canvas"
      />
    </div>
  );
}
