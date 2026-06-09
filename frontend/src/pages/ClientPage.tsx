import { useState, useCallback, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useWebcamCapture } from '../hooks/useWebcamCapture';
import { useScreenCapture } from '../hooks/useScreenCapture';
import { useWebRTC } from '../hooks/useWebRTC';
import { VideoPlayer } from '../components/VideoPlayer';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { TimestampCanvas } from '../components/TimestampCanvas';

export function ClientPage() {
  // Parse secure token from query parameters (3.3 & 4.2)
  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get('token');
  const expiresStr = queryParams.get('expires');
  const signature = queryParams.get('sig');
  
  const hasTokenParams = token && expiresStr && signature;
  const isExpired = expiresStr ? Date.now() > parseInt(expiresStr, 10) : false;

  const [authError, setAuthError] = useState<string | null>(
    !hasTokenParams ? 'Access Denied: Expiring cryptographic join token is missing.' : isExpired ? 'Access Denied: Join token has expired.' : null
  );

  const [clientName, setClientName] = useState(
    localStorage.getItem('crowdstream_name') || `Annotator-${Math.floor(Math.random() * 900) + 100}`
  );

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
    // Connect to signaling server with credentials
    if (!isSocketConnected) {
      const tokenString = window.location.search || '?token=dev-token';
      connectSocket('client', tokenString, clientName);
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

  // Explicitly release hardware holds (4.2 Security)
  const handleDisconnect = useCallback(() => {
    console.log('[Client] Explicitly stopping all tracks to release hardware holds.');
    disconnectWebRTC();
    webcam.stop();
    screen.stop();
    
    // Stop any tracks in stampedStream
    if (stampedStream) {
      stampedStream.getTracks().forEach((track) => track.stop());
    }
    
    setStampedStream(null);
    disconnectSocket();
  }, [disconnectWebRTC, webcam, screen, stampedStream, disconnectSocket]);

  // Listen for socket events (like remote termination)
  useEffect(() => {
    if (!isSocketConnected) return;

    // Remote termination forces immediate release of camera and screen capture APIs (4.2)
    const handleTerminate = () => {
      console.warn('[Client] Remote Admin terminated the meeting. Force-releasing hardware devices.');
      handleDisconnect();
    };

    socket.on('terminate-meeting', handleTerminate);
    return () => {
      socket.off('terminate-meeting', handleTerminate);
    };
  }, [isSocketConnected, socket, handleDisconnect]);

  // Frame Extraction Hook Loop: Samples 1 FPS base64 from webcam/screen and emits to server (3.5 AI CV Hook)
  useEffect(() => {
    const isLive = connectionState === 'connected';
    if (!isLive || !stampedStream) return;

    console.log('[Client] Frame Extraction Hook: Starting 1 FPS canvas sampling.');
    
    // Create hidden video element to feed the screen track
    const screenVideo = document.createElement('video');
    if (screen.stream) {
      screenVideo.srcObject = screen.stream;
      screenVideo.autoplay = true;
      screenVideo.playsInline = true;
      screenVideo.muted = true;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');

    const sampleInterval = setInterval(() => {
      if (!ctx) return;

      // Extract webcam frame
      const webcamTrack = stampedStream.getVideoTracks()[0];
      if (webcamTrack && webcamTrack.readyState === 'live') {
        // We can draw from our stampedStream if we attach it to a video element
        // Since TimestampCanvas already renders it to a canvas, we can sample the screen instead or render the stamped stream
        // For simulation completeness, let's capture from the screen video element
        if (screenVideo.readyState >= 2) {
          ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
          const screenFrame = canvas.toDataURL('image/jpeg', 0.4);
          
          socket.emit('frame-sample', {
            clientId: socket.id || '',
            streamType: 'screen',
            image: screenFrame,
            timestamp: Date.now(),
          });
        }
      }
    }, 1000); // exactly 1 frame per second (3.5)

    return () => {
      clearInterval(sampleInterval);
      screenVideo.srcObject = null;
    };
  }, [connectionState, stampedStream, screen.stream, socket]);

  // Sync client name with localStorage
  const handleNameChange = (name: string) => {
    setClientName(name);
    localStorage.setItem('crowdstream_name', name);
  };

  const isWebcamReady = webcam.isActive && stampedStream !== null;
  const isScreenReady = screen.isActive;
  const canConnect = isWebcamReady && isScreenReady && connectionState !== 'connected' && connectionState !== 'connecting';
  const isLive = connectionState === 'connected';

  // Render Access Denied UI if Token is Invalid/Expired (3.3 Secure Join)
  if (authError) {
    return (
      <div className="page-container client-auth-failed">
        <div className="auth-card">
          <div className="auth-error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="auth-title">Security Verification Required</h2>
          <p className="auth-desc">{authError}</p>
          <div className="auth-guideline">
            <p><strong>Note for developers:</strong> You can bypass this restriction by using a development link or clicking below:</p>
            <button 
              className="btn btn-secondary btn-full"
              onClick={() => {
                setAuthError(null);
                window.history.replaceState({}, document.title, "?token=dev-token");
              }}
            >
              Bypass Security (Join as Test Client)
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              <h1 className="header-title">Annotator Client</h1>
              <p className="header-subtitle">Join the secure CrowdStream auditing session</p>
            </div>
          </div>
          <div className="client-meta-config">
            <input 
              type="text" 
              className="client-name-input" 
              placeholder="Your Name" 
              value={clientName}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={isLive}
            />
            <ConnectionStatus state={connectionState} />
          </div>
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
                Webcam {webcam.isActive ? '(Live - Canvas Watermark)' : '(Off)'}
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
                {webcam.isActive ? 'Webcam Ready' : '1. Authorize Camera'}
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
                {screen.isActive ? 'Screen Ready' : '2. Share Desktop'}
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
                3. Stream to Host (Go Live)
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
              Disconnect &amp; Stop Hardware Hold
            </button>
          )}
        </div>

        {/* Status Steps */}
        <div className="status-steps">
          <div className={`status-step ${webcam.isActive ? 'step-complete' : 'step-pending'}`}>
            <div className="step-number">1</div>
            <span>Authorize webcam</span>
          </div>
          <div className="step-connector" />
          <div className={`status-step ${screen.isActive ? 'step-complete' : 'step-pending'}`}>
            <div className="step-number">2</div>
            <span>Select desktop picker</span>
          </div>
          <div className="step-connector" />
          <div className={`status-step ${isLive ? 'step-complete' : 'step-pending'}`}>
            <div className="step-number">3</div>
            <span>Auditing Live (1 FPS background CV)</span>
          </div>
        </div>
      </main>
    </div>
  );
}
