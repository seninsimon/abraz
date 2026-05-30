

import { useState, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useWebcamCapture } from '../hooks/useWebcamCapture';
import { useScreenCapture } from '../hooks/useScreenCapture';
import { useWebRTC } from '../hooks/useWebRTC';
import { VideoPlayer } from '../components/VideoPlayer';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { TimestampCanvas } from '../components/TimestampCanvas';

export function ClientPage() {
  const { socket, isConnected: isSocketConnected, connect: connectSocket, disconnect: disconnectSocket } = useSocket();
  const webcam = useWebcamCapture();
  const screen = useScreenCapture();
  const { connectionState, connect: connectWebRTC, disconnect: disconnectWebRTC } = useWebRTC(
    socket,
    'client',
    isSocketConnected
  );

  const [stampedStream, setStampedStream] = useState<MediaStream | null>(null);

  const handleStampedStream = useCallback((stream: MediaStream) => {
    setStampedStream(stream);
  }, []);


  const handleStartWebcam = async () => {
    await webcam.start();
    if (!isSocketConnected) {
      connectSocket('client');
    }
  };

  const handleStartScreen = async () => {
    await screen.start();
  };


  const handleConnect = async () => {
    if (!stampedStream || !screen.stream) {
      console.warn('[Client] Cannot connect: streams not ready');
      return;
    }
    await connectWebRTC(stampedStream, screen.stream, webcam.stream);
  };

  const handleDisconnect = () => {
    disconnectWebRTC();
    webcam.stop();
    screen.stop();
    setStampedStream(null);
    disconnectSocket();
  };

  const isWebcamReady = webcam.isActive && stampedStream !== null;
  const isScreenReady = screen.isActive;
  const canConnect = isWebcamReady && isScreenReady && connectionState !== 'connected' && connectionState !== 'connecting';
  const isLive = connectionState === 'connected';

  return (
    <div className="page-container">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <div className="header-title-group">
            <div className="header-icon client-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <div>
              <h1 className="header-title">Stream Client</h1>
              <p className="header-subtitle">Capture &amp; broadcast your webcam and screen</p>
            </div>
          </div>
          <ConnectionStatus state={connectionState} />
        </div>
      </header>

      {/* Main Content */}
      <main className="page-main">
        {/* Video Previews */}
        <div className="video-grid">
          {/* Webcam Preview with Timestamp Overlay */}
          <div className="video-card">
            {webcam.stream ? (
              <TimestampCanvas
                sourceStream={webcam.stream}
                onStampedStream={handleStampedStream}
                className="video-canvas-wrapper"
              />
            ) : (
              <VideoPlayer stream={null} label="Webcam" muted />
            )}
            <div className="video-card-footer">
              <span className="video-card-label">
                <span className={`video-card-dot ${webcam.isActive ? 'dot-active' : 'dot-inactive'}`} />
                Webcam {webcam.isActive ? '(Live)' : '(Off)'}
              </span>
            </div>
          </div>

          {/* Screen Share Preview */}
          <div className="video-card">
            <VideoPlayer stream={screen.stream} label="Screen Share" muted />
            <div className="video-card-footer">
              <span className="video-card-label">
                <span className={`video-card-dot ${screen.isActive ? 'dot-active' : 'dot-inactive'}`} />
                Screen {screen.isActive ? '(Sharing)' : '(Off)'}
              </span>
            </div>
          </div>
        </div>

        {/* Error Messages */}
        {(webcam.error || screen.error) && (
          <div className="error-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{webcam.error || screen.error}</span>
          </div>
        )}

        {/* Control Buttons */}
        <div className="controls-bar">
          {!isLive ? (
            <>
              <button
                onClick={handleStartWebcam}
                disabled={webcam.isActive}
                className="btn btn-primary"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 7l-7 5 7 5V7z" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                {webcam.isActive ? 'Webcam Active' : 'Start Webcam'}
              </button>

              <button
                onClick={handleStartScreen}
                disabled={!webcam.isActive || screen.isActive}
                className="btn btn-secondary"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                {screen.isActive ? 'Screen Active' : 'Start Screen Share'}
              </button>

              <button
                onClick={handleConnect}
                disabled={!canConnect}
                className="btn btn-accent"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
                Connect to Host
              </button>
            </>
          ) : (
            <button
              onClick={handleDisconnect}
              className="btn btn-danger"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Disconnect
            </button>
          )}
        </div>

        {/* Status Steps */}
        <div className="status-steps">
          <div className={`status-step ${webcam.isActive ? 'step-complete' : 'step-pending'}`}>
            <div className="step-number">1</div>
            <span>Start Webcam</span>
          </div>
          <div className="step-connector" />
          <div className={`status-step ${screen.isActive ? 'step-complete' : 'step-pending'}`}>
            <div className="step-number">2</div>
            <span>Share Screen</span>
          </div>
          <div className="step-connector" />
          <div className={`status-step ${isLive ? 'step-complete' : 'step-pending'}`}>
            <div className="step-number">3</div>
            <span>Go Live</span>
          </div>
        </div>
      </main>
    </div>
  );
}
