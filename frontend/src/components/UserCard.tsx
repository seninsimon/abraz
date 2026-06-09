import React, { useState, useEffect, useRef } from 'react';
import type { RemoteStreams, FlaggedEvent } from '../types';

interface UserCardProps {
  clientId: string;
  clientName: string;
  isSimulated?: boolean;
  simulatedSeed?: number;
  realStreams?: RemoteStreams;
  isFocused?: boolean;
  streamRate?: 'grid' | 'focus' | 'paused';
  onFlag: (event: Omit<FlaggedEvent, 'id' | 'timestamp'>) => void;
  onFocus: () => void;
}

export const UserCard: React.FC<UserCardProps> = ({
  clientId,
  clientName,
  isSimulated = false,
  simulatedSeed = 1,
  realStreams,
  isFocused = false,
  streamRate = 'grid',
  onFlag,
  onFocus,
}) => {
  const [layout, setLayout] = useState<'pip' | 'flip' | 'side-by-side'>('pip');
  const pipPosition = 'tr';
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('Idle');
  const [customLabel, setCustomLabel] = useState('');

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Setup real media streams
  useEffect(() => {
    if (!isSimulated && realStreams) {
      if (screenVideoRef.current && realStreams.screen) {
        screenVideoRef.current.srcObject = realStreams.screen;
      }
      if (cameraVideoRef.current && realStreams.webcam) {
        cameraVideoRef.current.srcObject = realStreams.webcam;
      }
    }
  }, [isSimulated, realStreams]);

  // Canvas drawing loop for simulated streams to conserve CPU and support 200 pods (3.2 & 4.1)
  useEffect(() => {
    if (!isSimulated) return;

    let animId: number;
    const fps = streamRate === 'grid' ? 2 : streamRate === 'paused' ? 0.2 : 30;
    const interval = 1000 / fps;
    let lastTime = 0;

    const ctxScreen = screenCanvasRef.current?.getContext('2d');
    const ctxCamera = cameraCanvasRef.current?.getContext('2d');

    const drawSimulated = (timestamp: number) => {
      if (timestamp - lastTime < interval) {
        animId = requestAnimationFrame(drawSimulated);
        return;
      }
      lastTime = timestamp;

      // Draw screen mock (IDE / code editor)
      if (ctxScreen && screenCanvasRef.current) {
        const w = screenCanvasRef.current.width;
        const h = screenCanvasRef.current.height;
        ctxScreen.fillStyle = '#0f172a';
        ctxScreen.fillRect(0, 0, w, h);

        // Sidebar mock
        ctxScreen.fillStyle = '#1e293b';
        ctxScreen.fillRect(0, 0, 45, h);
        ctxScreen.fillStyle = '#334155';
        ctxScreen.fillRect(10, 15, 25, 10);
        ctxScreen.fillRect(10, 35, 25, 8);
        ctxScreen.fillRect(10, 55, 25, 8);

        // Code lines mock
        ctxScreen.font = '9px Consolas, monospace';
        const lines = [
          `import React, { useState } from 'react';`,
          `// Annotator: ${clientName}`,
          `const index = ${simulatedSeed + Math.floor(timestamp / 5000) % 50};`,
          `function ProcessFrame(data) {`,
          `  const threshold = 0.85;`,
          `  if (data.accuracy > threshold) {`,
          `    return verifyAnnotation(data);`,
          `  }`,
          `  return reQueueTask();`,
          `}`
        ];
        lines.forEach((line, index) => {
          ctxScreen.fillStyle = line.startsWith('//')
            ? '#64748b'
            : line.includes('function') || line.includes('import')
            ? '#8b5cf6'
            : '#38bdf8';
          ctxScreen.fillText(line, 55, 25 + index * 14);
        });

        // Running progress simulated bar
        ctxScreen.fillStyle = '#1e293b';
        ctxScreen.fillRect(55, 175, 200, 6);
        ctxScreen.fillStyle = '#10b981';
        ctxScreen.fillRect(55, 175, ((simulatedSeed * 25 + timestamp / 20) % 200), 6);

        // Frame indicator overlay
        ctxScreen.fillStyle = 'rgba(6, 182, 212, 0.7)';
        ctxScreen.font = '8px Inter, sans-serif';
        ctxScreen.fillText(`SIMULATED FEED | ${fps} FPS | 1080p`, w - 110, 15);
      }

      // Draw camera mock (annotator's face silhouette moving)
      if (ctxCamera && cameraCanvasRef.current) {
        const w = cameraCanvasRef.current.width;
        const h = cameraCanvasRef.current.height;
        ctxCamera.fillStyle = '#111827';
        ctxCamera.fillRect(0, 0, w, h);

        // Grid background line
        ctxCamera.strokeStyle = 'rgba(255,255,255,0.03)';
        ctxCamera.lineWidth = 1;
        for (let i = 0; i < w; i += 20) {
          ctxCamera.beginPath();
          ctxCamera.moveTo(i, 0);
          ctxCamera.lineTo(i, h);
          ctxCamera.stroke();
        }

        // Draw animated head
        const timeFactor = timestamp / 800 + simulatedSeed;
        const headX = w / 2 + Math.sin(timeFactor) * 8;
        const headY = h / 2 - 5 + Math.cos(timeFactor * 0.8) * 3;

        // Neck
        ctxCamera.fillStyle = '#374151';
        ctxCamera.fillRect(headX - 6, headY + 12, 12, 15);

        // Shoulders
        ctxCamera.beginPath();
        ctxCamera.ellipse(headX, headY + 32, 28, 16, 0, 0, 2 * Math.PI);
        ctxCamera.fillStyle = '#1f2937';
        ctxCamera.fill();

        // Head
        ctxCamera.beginPath();
        ctxCamera.arc(headX, headY, 18, 0, 2 * Math.PI);
        ctxCamera.fillStyle = '#4b5563';
        ctxCamera.fill();

        // Eyeglasses outline (if seed is even)
        if (simulatedSeed % 2 === 0) {
          ctxCamera.strokeStyle = '#06b6d4';
          ctxCamera.lineWidth = 1.5;
          ctxCamera.strokeRect(headX - 10, headY - 4, 7, 5);
          ctxCamera.strokeRect(headX + 3, headY - 4, 7, 5);
          ctxCamera.beginPath();
          ctxCamera.moveTo(headX - 3, headY - 2);
          ctxCamera.lineTo(headX + 3, headY - 2);
          ctxCamera.stroke();
        }

        // FPS status watermark
        ctxCamera.fillStyle = 'rgba(255,255,255,0.4)';
        ctxCamera.font = '8px sans-serif';
        ctxCamera.fillText(`CAM | ${clientName.substring(0, 8)}`, 8, h - 8);
      }

      animId = requestAnimationFrame(drawSimulated);
    };

    animId = requestAnimationFrame(drawSimulated);
    return () => cancelAnimationFrame(animId);
  }, [isSimulated, streamRate, simulatedSeed, clientName]);

  // Capture lossless composite screenshot for event flagging (3.4)
  const handleFlagClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowFlagModal(true);
  };

  const submitFlag = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Background
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(0, 0, 1280, 720);

      // Draw screen onto left side (or full screen)
      if (isSimulated) {
        if (screenCanvasRef.current) {
          ctx.drawImage(screenCanvasRef.current, 0, 0, 850, 720);
        }
        if (cameraCanvasRef.current) {
          ctx.drawImage(cameraCanvasRef.current, 860, 180, 400, 360);
        }
      } else {
        if (screenVideoRef.current) {
          ctx.drawImage(screenVideoRef.current, 0, 0, 850, 720);
        }
        if (cameraVideoRef.current) {
          ctx.drawImage(cameraVideoRef.current, 860, 180, 400, 360);
        }
      }

      // Watermark metadata
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px sans-serif';
      ctx.fillText(`CROWDSTREAM LOSSLESS AUDIT SCREENSHOT`, 40, 50);
      ctx.fillStyle = '#06b6d4';
      ctx.font = '16px monospace';
      ctx.fillText(`CLIENT ID: ${clientId}`, 40, 80);
      ctx.fillText(`CLIENT NAME: ${clientName}`, 40, 105);
      ctx.fillText(`TIMESTAMP: ${new Date().toLocaleString()}`, 40, 130);

      const screenshotData = canvas.toDataURL('image/png');
      onFlag({
        clientId,
        clientName,
        screenshot: screenshotData,
        label: customLabel || selectedLabel,
      });

      setShowFlagModal(false);
      setCustomLabel('');
    }
  };

  const toggleLayout = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLayout(prev => {
      if (prev === 'pip') return 'flip';
      if (prev === 'flip') return 'side-by-side';
      return 'pip';
    });
  };

  const togglePipMain = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLayout(prev => prev === 'pip' ? 'flip' : 'pip');
  };

  const hasRealWebcam = !isSimulated && realStreams?.webcam;
  const hasRealScreen = !isSimulated && realStreams?.screen;

  return (
    <div className={`user-card ${isFocused ? 'card-focused' : ''}`} onClick={onFocus}>
      {/* Container display header */}
      <div className="card-header-overlay">
        <div className="card-user-info">
          <span className={`status-dot ${streamRate === 'paused' ? 'status-neutral' : 'status-success'}`} />
          <span className="user-name">{clientName}</span>
          {isSimulated ? (
            <span className="simulated-badge">SIM</span>
          ) : (
            <span className="live-pill">LIVE</span>
          )}
        </div>
        <div className="card-actions-row">
          <button className="card-mini-btn" onClick={toggleLayout} title="Change Layout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M15 3v18" />
            </svg>
          </button>
          <button className="card-mini-btn btn-flag-red" onClick={handleFlagClick} title="Flag Event">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`card-video-content ${layout}-layout`}>
        {layout === 'pip' && (
          <div className="pip-video-container">
            {/* Screen (Main) */}
            <div className="main-feed">
              {isSimulated ? (
                <canvas ref={screenCanvasRef} width={480} height={270} className="video-element" />
              ) : hasRealScreen ? (
                <video ref={screenVideoRef} autoPlay playsInline muted className="video-element" />
              ) : (
                <div className="video-placeholder">Screen Stream Pending</div>
              )}
            </div>

            {/* Webcam (PIP overlay) */}
            <div className={`pip-overlay-feed pip-${pipPosition}`} onClick={togglePipMain}>
              {isSimulated ? (
                <canvas ref={cameraCanvasRef} width={160} height={90} className="video-element" />
              ) : hasRealWebcam ? (
                <video ref={cameraVideoRef} autoPlay playsInline muted className="video-element" />
              ) : (
                <div className="video-placeholder">Cam</div>
              )}
            </div>
          </div>
        )}

        {layout === 'flip' && (
          <div className="pip-video-container">
            {/* Camera (Main) */}
            <div className="main-feed">
              {isSimulated ? (
                <canvas ref={cameraCanvasRef} width={480} height={270} className="video-element" />
              ) : hasRealWebcam ? (
                <video ref={cameraVideoRef} autoPlay playsInline muted className="video-element" />
              ) : (
                <div className="video-placeholder">Camera Stream Pending</div>
              )}
            </div>

            {/* Screen (PIP overlay) */}
            <div className={`pip-overlay-feed pip-${pipPosition}`} onClick={togglePipMain}>
              {isSimulated ? (
                <canvas ref={screenCanvasRef} width={160} height={90} className="video-element" />
              ) : hasRealScreen ? (
                <video ref={screenVideoRef} autoPlay playsInline muted className="video-element" />
              ) : (
                <div className="video-placeholder">Screen</div>
              )}
            </div>
          </div>
        )}

        {layout === 'side-by-side' && (
          <div className="side-by-side-container">
            <div className="side-pane">
              {isSimulated ? (
                <canvas ref={screenCanvasRef} width={240} height={135} className="video-element" />
              ) : hasRealScreen ? (
                <video ref={screenVideoRef} autoPlay playsInline muted className="video-element" />
              ) : (
                <div className="video-placeholder">Screen</div>
              )}
            </div>
            <div className="side-pane">
              {isSimulated ? (
                <canvas ref={cameraCanvasRef} width={240} height={135} className="video-element" />
              ) : hasRealWebcam ? (
                <video ref={cameraVideoRef} autoPlay playsInline muted className="video-element" />
              ) : (
                <div className="video-placeholder">Webcam</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Info bar */}
      <div className="card-footer-overlay">
        <span className="card-fps-watermark">
          {streamRate === 'paused' ? '⏸️ Paused (Viewport)' : `⚡ ${streamRate === 'focus' ? '30 FPS' : '2 FPS'} (SFU)`}
        </span>
        <span className="card-status-label">{isSimulated ? 'Simulated Annotator' : 'Secure WebRTC P2P'}</span>
      </div>

      {/* Flag Prompt Modal overlay */}
      {showFlagModal && (
        <div className="card-flag-modal" onClick={(e) => e.stopPropagation()}>
          <div className="flag-modal-content">
            <h4>Flag Behavior Audit</h4>
            <p className="flag-subtitle">Select alert classification for {clientName}:</p>
            <div className="flag-labels-grid">
              {['Idle / Inactive', 'Wrong Annotation Protocol', 'Mobile Phone Detected', 'Unauthorized Person', 'Restricted Website Visited'].map(label => (
                <button
                  key={label}
                  className={`flag-select-btn ${selectedLabel === label ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedLabel(label);
                    setCustomLabel('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="custom-input-group">
              <label>Or write custom label:</label>
              <input
                type="text"
                placeholder="e.g. Tab Switching repeatedly"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
            </div>
            <div className="flag-modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowFlagModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={submitFlag}>Save Audit Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
