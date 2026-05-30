

import { useEffect, useRef } from 'react';
import type { VideoPlayerProps } from '../types';

export function VideoPlayer({ stream, label, muted = false, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach the MediaStream to the video element whenever it changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }

    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <div className={`video-player-container ${className}`}>
      {/* Label overlay */}
      <div className="video-label">
        <div className="video-label-dot" />
        <span>{label}</span>
      </div>

      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="video-element"
        />
      ) : (
        <div className="video-placeholder">
          <div className="video-placeholder-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 7l-7 5 7 5V7z" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <p className="video-placeholder-text">Waiting for {label.toLowerCase()}…</p>
        </div>
      )}
    </div>
  );
}
