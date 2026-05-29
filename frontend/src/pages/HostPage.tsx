/**
 * HostPage — the streaming receiver's dashboard.
 * 
 * Displays both the webcam and screen share streams from the client
 * side by side. Automatically receives streams when a client connects.
 * Shows a waiting animation when no client is connected.
 */

import { useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { VideoPlayer } from '../components/VideoPlayer';
import { ConnectionStatus } from '../components/ConnectionStatus';

export function HostPage() {
  const { socket, isConnected: isSocketConnected, connect: connectSocket } = useSocket();
  const { connectionState, remoteStreams } = useWebRTC(socket, 'host', isSocketConnected);

  // Connect to signaling server as host on mount
  useEffect(() => {
    if (!isSocketConnected) {
      connectSocket('host');
    }
  }, [isSocketConnected, connectSocket]);

  const isReceiving = connectionState === 'connected';
  const hasWebcam = remoteStreams.webcam !== null;
  const hasScreen = remoteStreams.screen !== null;

  return (
    <div className="page-container host-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <div className="header-title-group">
            <div className="header-icon host-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <h1 className="header-title">Host Dashboard</h1>
              <p className="header-subtitle">Monitor incoming streams in real time</p>
            </div>
          </div>
          <div className="header-right">
            <ConnectionStatus state={connectionState} />
            {isReceiving && (
              <div className="live-badge">
                <span className="live-badge-dot" />
                LIVE
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="page-main host-main">
        {isReceiving ? (
          /* Connected — show streams side by side */
          <div className="host-video-grid">
            <div className="video-card host-video-card">
              <VideoPlayer stream={remoteStreams.webcam} label="Webcam Feed" />
              <div className="video-card-footer">
                <span className="video-card-label">
                  <span className={`video-card-dot ${hasWebcam ? 'dot-active' : 'dot-inactive'}`} />
                  Webcam {hasWebcam ? '(Receiving)' : '(Waiting…)'}
                </span>
              </div>
            </div>

            <div className="video-card host-video-card">
              <VideoPlayer stream={remoteStreams.screen} label="Screen Share" />
              <div className="video-card-footer">
                <span className="video-card-label">
                  <span className={`video-card-dot ${hasScreen ? 'dot-active' : 'dot-inactive'}`} />
                  Screen {hasScreen ? '(Receiving)' : '(Waiting…)'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Waiting for client — show animated placeholder */
          <div className="waiting-container">
            <div className="waiting-animation">
              <div className="waiting-ring" />
              <div className="waiting-ring waiting-ring-delay" />
              <div className="waiting-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
            </div>
            <h2 className="waiting-title">Waiting for Client</h2>
            <p className="waiting-subtitle">
              The dashboard will automatically display streams when a client connects.
            </p>
            <div className="waiting-info">
              <div className="info-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Auto-reconnect enabled</span>
              </div>
              <div className="info-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Socket {isSocketConnected ? 'connected' : 'connecting…'}</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
