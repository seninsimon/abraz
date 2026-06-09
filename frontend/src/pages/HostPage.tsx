import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { UserCard } from '../components/UserCard';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { LosslessZoom } from '../components/LosslessZoom';
import type { ClientProfile, FlaggedEvent } from '../types';

export function HostPage() {
  const { socket, isConnected: isSocketConnected, connect: connectSocket } = useSocket();
  const { connectionState, remoteStreamsMap, disconnectClient } = useWebRTC(socket, 'host', isSocketConnected);

  // States
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedClient, setFocusedClient] = useState<ClientProfile | null>(null);
  const [flaggedEvents, setFlaggedEvents] = useState<FlaggedEvent[]>([]);
  
  // Token generation state
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // AI Inference logs mock
  const [aiLogs, setAiLogs] = useState<string[]>([]);
  const aiLogsEndRef = useRef<HTMLDivElement | null>(null);

  // Generate simulated annotators list (3.1 & 4.1)
  useEffect(() => {
    const list: ClientProfile[] = [];
    for (let i = 1; i <= 199; i++) {
      list.push({
        id: `sim-client-${i}`,
        name: `Annotator ${String(i).padStart(3, '0')}`,
        role: 'client',
        isSimulated: true,
        webcamActive: true,
        screenActive: true,
        fps: 2,
        resolution: '1280x720',
        streamState: 'grid',
        simulatedSeed: i,
      });
    }
    setClients(list);
  }, []);

  // Sync real WebRTC connected clients into our profile list (Prepend real clients)
  useEffect(() => {
    setClients((prev) => {
      // Retain simulated clients
      const simulated = prev.filter(c => c.isSimulated);
      const updatedList: ClientProfile[] = [];

      // Add real clients from remoteStreamsMap
      remoteStreamsMap.forEach((_streams, socketId) => {
        updatedList.push({
          id: socketId,
          name: `Live Client (${socketId.substring(0, 5)})`,
          role: 'client',
          isSimulated: false,
          webcamActive: true,
          screenActive: true,
          fps: focusedClient?.id === socketId ? 30 : 2,
          resolution: focusedClient?.id === socketId ? '1920x1080' : '1280x720',
          streamState: focusedClient?.id === socketId ? 'focus' : 'grid',
          simulatedSeed: 0,
        });
      });

      return [...updatedList, ...simulated];
    });
  }, [remoteStreamsMap, focusedClient]);

  // Connect socket
  useEffect(() => {
    if (!isSocketConnected) {
      connectSocket('host');
    }
  }, [isSocketConnected, connectSocket]);

  // Auto-scroll AI logs
  useEffect(() => {
    aiLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiLogs]);

  // Handle frame samples received notification to append to backend logs overlay
  useEffect(() => {
    if (!isSocketConnected) return;

    const handleFrameSampleLog = (data: { clientId: string; streamType: string; timestamp: number }) => {
      const timestamp = new Date(data.timestamp).toLocaleTimeString();
      const logs = [
        `[AI Queue] Frame ingested for ${data.clientId.substring(0, 6)} (${data.streamType}) at ${timestamp}`,
        `[CV Models] Running attentiveness classification...`,
        `[Result] Normal | Attentive rating: ${(85 + Math.random() * 14).toFixed(1)}%`
      ];
      setAiLogs(prev => [...prev.slice(-30), ...logs]);
    };

    socket.on('frame-sample-received', handleFrameSampleLog);
    return () => {
      socket.off('frame-sample-received', handleFrameSampleLog);
    };
  }, [isSocketConnected, socket]);

  // Viewport Awareness: emit active client IDs to server whenever viewport page / search query changes (3.1 Page 2 Pagination)
  const getFilteredClients = useCallback(() => {
    if (!searchQuery) return clients;
    return clients.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [clients, searchQuery]);

  const filtered = getFilteredClients();
  const totalPages = Math.ceil(filtered.length / 50) || 1;
  const currentPod = filtered.slice((currentPage - 1) * 50, currentPage * 50);

  useEffect(() => {
    if (!isSocketConnected) return;
    
    const visibleIds = currentPod.map(c => c.id);
    socket.emit('viewport-update', { visibleClientIds: visibleIds });

    // Update streamState locally for simulated items
    setClients(prev => prev.map(c => {
      if (!c.isSimulated) return c;
      const isVisible = visibleIds.includes(c.id);
      return {
        ...c,
        streamState: isVisible ? 'grid' : 'paused',
        fps: isVisible ? 2 : 0.2
      };
    }));
  }, [currentPage, searchQuery, isSocketConnected, socket, clients.length]); // depend on clients.length to capture changes

  // Generate secure token URL (4.2 Security)
  const generateTokenLink = async () => {
    const tokenVal = 'token-' + Math.random().toString(36).substring(2, 10);
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes validity
    const message = `${tokenVal}:${expires}`;
    
    // Calculate client-side HMAC signature matching the server
    const encoder = new TextEncoder();
    const keyData = encoder.encode('crowdstream-secret-key-1337');
    const messageData = encoder.encode(message);
    
    try {
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signatureBuffer = await window.crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        messageData
      );
      
      const hashArray = Array.from(new Uint8Array(signatureBuffer));
      const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const secureQuery = `?token=${tokenVal}&expires=${expires}&sig=${signature}`;
      const fullLink = `${window.location.origin}/client${secureQuery}`;
      
      setGeneratedLink(fullLink);
      setLinkCopied(false);
    } catch (err) {
      console.error('[Host] Token generation failed:', err);
    }
  };

  const copyGeneratedLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Flag Event audit logger (3.4)
  const handleFlagEvent = (eventData: Omit<FlaggedEvent, 'id' | 'timestamp'>) => {
    const newEvent: FlaggedEvent = {
      ...eventData,
      id: `flag-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
    };
    setFlaggedEvents(prev => [newEvent, ...prev]);

    // Send flagging alert to socket server for stdout logs
    if (isSocketConnected) {
      socket.emit('flag-event', newEvent);
    }
  };

  // Focus specific user card (3.1 Focus State)
  const handleFocusClient = (client: ClientProfile) => {
    setFocusedClient(client);
    // Upgrade framerate constraint for target client via socket
    if (isSocketConnected && !client.isSimulated) {
      socket.emit('set-client-rate', { clientId: client.id, mode: 'focus' });
    }
  };

  const handleCloseFocus = () => {
    if (focusedClient) {
      // Demote rate back to grid
      if (isSocketConnected && !focusedClient.isSimulated) {
        socket.emit('set-client-rate', { clientId: focusedClient.id, mode: 'grid' });
      }
    }
    setFocusedClient(null);
  };

  // Admin meeting termination command (4.2 Security)
  const handleTerminateAll = () => {
    const confirmTerm = window.confirm("Are you sure you want to terminate this meeting? This will remotely revoke webcam & screen authorization holds on all client annotator devices.");
    if (confirmTerm && isSocketConnected) {
      socket.emit('terminate-meeting');
      // Disconnect all local peer connections
      remoteStreamsMap.forEach((_, socketId) => {
        disconnectClient(socketId);
      });
      alert("Termination signal broadcast successfully. Access revoked.");
    }
  };


  return (
    <div className="page-container host-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <div className="header-title-group">
            <div className="header-icon host-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <h1 className="header-title">CrowdStream Host Dashboard</h1>
              <p className="header-subtitle">Adaptive Multi-Stream Audit Console (200+ Annotators Capacity)</p>
            </div>
          </div>
          <div className="header-right">
            <ConnectionStatus state={connectionState} />
            <button className="btn btn-danger btn-sm" onClick={handleTerminateAll}>
              ⚠️ Terminate Session
            </button>
          </div>
        </div>
      </header>

      {/* Grid view controls bar */}
      <div className="host-toolbar">
        <div className="search-group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search annotator name or client ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>

        {/* Paginator */}
        <div className="paginator-container">
          <button 
            className="paginator-btn" 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
          >
            &lt; Previous
          </button>
          <span className="paginator-info">
            Pod <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filtered.length} total)
          </span>
          <button 
            className="paginator-btn" 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            Next &gt;
          </button>
        </div>
      </div>

      {/* Multi layout shell */}
      <div className="host-dashboard-layout">
        {/* Main Grid View */}
        <div className="host-grid-section">
          {currentPod.length > 0 ? (
            <div className="host-smart-grid">
              {currentPod.map(client => {
                const streams = !client.isSimulated ? remoteStreamsMap.get(client.id) : undefined;
                return (
                  <UserCard
                    key={client.id}
                    clientId={client.id}
                    clientName={client.name}
                    isSimulated={client.isSimulated}
                    simulatedSeed={client.simulatedSeed}
                    realStreams={streams}
                    streamRate={client.streamState}
                    onFlag={handleFlagEvent}
                    onFocus={() => handleFocusClient(client)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="no-results-banner">
              <h3>No Annotators Found</h3>
              <p>Try refining your search keyword or clearing the input filter.</p>
            </div>
          )}
        </div>

        {/* Right Audit/AI Drawer Panel */}
        <div className="host-sidebar-section">
          {/* Security URL Generator Card */}
          <div className="sidebar-card">
            <h3>Expiring Join Link Generator</h3>
            <p className="sidebar-card-desc">Generate secure invitation links with 10-minute validity checks.</p>
            <div className="link-generator-actions">
              <button className="btn btn-primary btn-sm btn-full" onClick={generateTokenLink}>
                Generate Expiring Link
              </button>
              {generatedLink && (
                <div className="generated-link-display">
                  <input type="text" readOnly value={generatedLink} />
                  <button className="btn btn-accent btn-sm" onClick={copyGeneratedLink}>
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Flagged Audit Events log */}
          <div className="sidebar-card logs-card">
            <h3>Flagged Event Audit Log ({flaggedEvents.length})</h3>
            <div className="flagged-events-list">
              {flaggedEvents.length > 0 ? (
                flaggedEvents.map(event => (
                  <div key={event.id} className="flagged-event-item">
                    <div className="event-item-header">
                      <span className="event-item-name">{event.clientName}</span>
                      <span className="event-item-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="event-item-label">{event.label}</div>
                    {event.screenshot && (
                      <div className="event-item-screenshot">
                        <img src={event.screenshot} alt="Audit Screenshot" onClick={() => {
                          const w = window.open();
                          if (w) w.document.write(`<img src="${event.screenshot}" style="max-width:100%; border-radius:8px;" />`);
                        }} />
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-logs-placeholder">No flagged behaviors recorded. Click the Flag icon on user cards.</div>
              )}
            </div>
          </div>

          {/* AI Queue logs overlay */}
          <div className="sidebar-card logs-card">
            <h3>AI CV Frame Extraction Feed</h3>
            <p className="sidebar-card-desc">Asynchronous pipeline ingestion at 1 FPS.</p>
            <div className="ai-console-logs">
              {aiLogs.map((log, index) => (
                <div 
                  key={index} 
                  className={`console-log-line ${log.includes('INGEST') || log.includes('Frame ingested') ? 'log-ingest' : log.includes('⚠️') ? 'log-alert' : ''}`}
                >
                  {log}
                </div>
              ))}
              <div ref={aiLogsEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Focus State / Lossless Zoom Overlay Modal (3.1 & 4.3) */}
      {focusedClient && (
        <div className="focus-modal-overlay" onClick={handleCloseFocus}>
          <div className="focus-modal-content" onClick={e => e.stopPropagation()}>
            <div className="focus-modal-header">
              <div className="focus-client-title">
                <span className="live-pill">FOCUS</span>
                <h2>{focusedClient.name}</h2>
                <span className="focus-fps-pill">1080p | 30 FPS Lossless Stream</span>
              </div>
              <button className="focus-close-btn" onClick={handleCloseFocus}>&times;</button>
            </div>

            <div className="focus-modal-grid">
              {/* Zoom Container - Screen share (Crisp Render) */}
              <div className="focus-zoom-pane">
                <LosslessZoom>
                  {focusedClient.isSimulated ? (
                    <div className="focused-simulated-canvas-wrapper">
                      {/* High-res simulation canvas overlay inside zoom */}
                      <canvas 
                        id={`focus-sim-canvas-${focusedClient.id}`}
                        width={1920} 
                        height={1080} 
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    </div>
                  ) : remoteStreamsMap.get(focusedClient.id)?.screen ? (
                    <video 
                      autoPlay 
                      playsInline 
                      muted 
                      className="video-element focused-video-render"
                      ref={(el) => {
                        if (el && remoteStreamsMap.get(focusedClient.id)?.screen) {
                          el.srcObject = remoteStreamsMap.get(focusedClient.id)!.screen;
                        }
                      }}
                    />
                  ) : (
                    <div className="video-placeholder">Screen share feed not active</div>
                  )}
                </LosslessZoom>
              </div>

              {/* Side panel with camera PIP and metrics */}
              <div className="focus-side-pane">
                <div className="focus-cam-card">
                  <h4>Webcam Feed</h4>
                  <div className="focus-cam-video-wrapper">
                    {focusedClient.isSimulated ? (
                      <canvas 
                        id={`focus-sim-cam-${focusedClient.id}`}
                        width={320} 
                        height={180} 
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : remoteStreamsMap.get(focusedClient.id)?.webcam ? (
                      <video 
                        autoPlay 
                        playsInline 
                        muted 
                        className="video-element"
                        ref={(el) => {
                          if (el && remoteStreamsMap.get(focusedClient.id)?.webcam) {
                            el.srcObject = remoteStreamsMap.get(focusedClient.id)!.webcam;
                          }
                        }}
                      />
                    ) : (
                      <div className="video-placeholder">Webcam stream not active</div>
                    )}
                  </div>
                </div>

                <div className="focus-metrics-card">
                  <h4>Stream Metrics</h4>
                  <div className="metrics-grid">
                    <div className="metric-item">
                      <div className="metric-label">Framerate</div>
                      <div className="metric-value text-cyan">30 FPS</div>
                    </div>
                    <div className="metric-item">
                      <div className="metric-label">Resolution</div>
                      <div className="metric-value">1920 &times; 1080</div>
                    </div>
                    <div className="metric-item">
                      <div className="metric-label">Estimated Bandwidth</div>
                      <div className="metric-value text-teal">~1.45 Mbps</div>
                    </div>
                    <div className="metric-item">
                      <div className="metric-label">Latency</div>
                      <div className="metric-value text-green">~42ms</div>
                    </div>
                  </div>
                </div>

                <div className="focus-actions-card">
                  <h4>Administrative Actions</h4>
                  <button className="btn btn-danger btn-full" onClick={() => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1280;
                    canvas.height = 720;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                      ctx.fillStyle = '#0a0e1a';
                      ctx.fillRect(0, 0, 1280, 720);
                      ctx.fillStyle = '#ffffff';
                      ctx.font = '24px sans-serif';
                      ctx.fillText(`Audited Flagged Event: ${focusedClient.name}`, 50, 200);
                      ctx.fillText(`Timestamp: ${new Date().toLocaleString()}`, 50, 240);
                      handleFlagEvent({
                        clientId: focusedClient.id,
                        clientName: focusedClient.name,
                        screenshot: canvas.toDataURL('image/png'),
                        label: 'Focused Admin Override Audit',
                      });
                    }
                  }}>
                    Flag Behavior Alert
                  </button>
                  <p className="focus-guidance-text">Focus view uses WebRTC Selective Forwarding (SFU) viewport optimization, prioritizing high bitrates only for the selected active viewport.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Render loop for high-res canvases inside focus modal */}
      <FocusSimCanvasDrawer focusedClient={focusedClient} />
    </div>
  );
}

// Subcomponent to handle drawing on focus canvas if client is simulated
function FocusSimCanvasDrawer({ focusedClient }: { focusedClient: ClientProfile | null }) {
  useEffect(() => {
    if (!focusedClient || !focusedClient.isSimulated) return;

    let animId: number;
    
    const drawFocusSim = (timestamp: number) => {
      const scrCanvas = document.getElementById(`focus-sim-canvas-${focusedClient.id}`) as HTMLCanvasElement;
      const camCanvas = document.getElementById(`focus-sim-cam-${focusedClient.id}`) as HTMLCanvasElement;

      if (scrCanvas) {
        const ctx = scrCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, scrCanvas.width, scrCanvas.height);

          // Render high-fidelity text zoom mock (Lossless Zoom text check)
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, 0, 200, scrCanvas.height); // Side layout

          ctx.fillStyle = '#38bdf8';
          ctx.font = '24px Consolas, monospace';
          ctx.fillText(`// HIGH FIDELITY lossless text zoom validation`, 250, 80);
          ctx.fillText(`// Drag or scroll wheel to zoom into this region without pixelation`, 250, 120);

          ctx.fillStyle = '#f1f5f9';
          ctx.font = '16px Inter, sans-serif';
          ctx.fillText(`Annotator Name: ${focusedClient.name}`, 250, 200);
          ctx.fillText(`Client ID: ${focusedClient.id}`, 250, 230);
          
          ctx.fillStyle = '#64748b';
          ctx.fillText(`Lorem ipsum dolor sit amet, consectetur adipiscing elit.`, 250, 300);
          ctx.fillText(`Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`, 250, 330);
          ctx.fillText(`Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`, 250, 360);

          // Simulated terminal lines
          ctx.fillStyle = '#10b981';
          ctx.font = '14px monospace';
          for (let i = 0; i < 15; i++) {
            ctx.fillText(`[System Log] Row ${i + 1}: Event trace verified successfully. Status: OK`, 250, 440 + i * 24);
          }

          // Frame index info
          ctx.fillStyle = '#8b5cf6';
          ctx.font = '14px sans-serif';
          ctx.fillText(`Focused Stream Status: Active (30 FPS, lossless 1080p source)`, 250, 400);
        }
      }

      if (camCanvas) {
        const ctx = camCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#111827';
          ctx.fillRect(0, 0, camCanvas.width, camCanvas.height);

          const timeFactor = timestamp / 800;
          const headX = camCanvas.width / 2 + Math.sin(timeFactor) * 15;
          const headY = camCanvas.height / 2 - 10 + Math.cos(timeFactor * 0.8) * 5;

          // Body
          ctx.fillStyle = '#1f2937';
          ctx.beginPath();
          ctx.ellipse(headX, headY + 70, 60, 30, 0, 0, 2 * Math.PI);
          ctx.fill();

          // Neck
          ctx.fillStyle = '#374151';
          ctx.fillRect(headX - 12, headY + 20, 24, 30);

          // Head
          ctx.beginPath();
          ctx.arc(headX, headY, 35, 0, 2 * Math.PI);
          ctx.fillStyle = '#4b5563';
          ctx.fill();

          // Green dot (active recording)
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(20, 20, 6, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      animId = requestAnimationFrame(drawFocusSim);
    };

    animId = requestAnimationFrame(drawFocusSim);
    return () => cancelAnimationFrame(animId);
  }, [focusedClient]);

  return null;
}
