# METHODOLOGY

Technical design rationale, engineering challenges, and solutions for the DualStream application.

---

## Architecture Choices

### Why WebRTC?

WebRTC was selected as the media transport protocol for several critical reasons:

1. **Ultra-Low Latency**: WebRTC achieves sub-second latency by establishing direct peer-to-peer connections. Unlike HTTP-based streaming (HLS/DASH), which introduces 3–30 second delays due to segment-based delivery, WebRTC streams media in real time.

2. **Browser-Native**: WebRTC is built into every modern browser. No plugins, no polyfills, no additional downloads. The `getUserMedia`, `getDisplayMedia`, and `RTCPeerConnection` APIs are part of the Web Platform.

3. **Peer-to-Peer**: Media flows directly between the client and host browsers. The server only handles signaling (SDP exchange, ICE candidates). This reduces server costs and bandwidth — the server never touches the actual video/audio data.

4. **Adaptive Quality**: WebRTC includes built-in congestion control and bandwidth estimation. It dynamically adjusts video quality based on network conditions without any application-level logic.

5. **Multiple Track Support**: A single `RTCPeerConnection` can carry multiple audio and video tracks, making it ideal for our dual-stream (webcam + screen) architecture.

### Why Socket.IO for Signaling?

Socket.IO was chosen over raw WebSockets or HTTP polling for signaling:

1. **Automatic Reconnection**: Socket.IO handles connection drops and retries transparently. When a client disconnects, the library automatically attempts reconnection with exponential backoff.

2. **Room Support**: Built-in room abstraction (`socket.join()`, `socket.to()`) simplifies broadcasting signaling messages to the correct peers without manual routing logic.

3. **Transport Fallback**: Socket.IO starts with WebSocket but falls back to HTTP long-polling if WebSocket is blocked, ensuring connectivity across restrictive networks.

4. **Event-Based API**: The `emit/on` pattern maps naturally to WebRTC signaling events (offer, answer, ICE candidate), making the code intuitive and maintainable.

### Why React?

1. **Component Model**: The application UI naturally decomposes into components (VideoPlayer, TimestampCanvas, ConnectionStatus). React's component architecture with props and hooks provides a clean separation of concerns.

2. **Custom Hooks**: React hooks (`useWebRTC`, `useSocket`, `useWebcamCapture`, `useScreenCapture`) encapsulate complex imperative WebRTC/MediaStream logic behind a declarative API, keeping page components focused on layout.

3. **Ecosystem**: React has the largest ecosystem of libraries, tooling, and community knowledge. TypeScript support is first-class.

### Why Node.js?

1. **Same Language**: TypeScript on both client and server enables shared type definitions, reducing bugs at the signaling boundary.

2. **Lightweight**: The signaling server is extremely simple (relay SDP + ICE messages). Node.js's event-driven model is perfect for this I/O-bound, low-CPU workload.

3. **Socket.IO Native**: Socket.IO was built for Node.js. The server-side integration is zero-friction.

---

## Engineering Challenges & Solutions

### 1. Multiple Stream Handling

**Challenge**: WebRTC's `ontrack` event fires once per track, not per stream. When sending 2 video tracks (webcam + screen) and potentially 2 audio tracks, the host receives 4 separate `ontrack` events. There's no built-in way to know which track is "webcam" and which is "screen."

**Solution**: We use **track metadata passed through signaling**. When the client creates the SDP offer, it attaches a `trackMetadata` array that maps each `MediaStream.id` to a `streamType` ('webcam' or 'screen'). The host receives this metadata alongside the offer and uses it in the `ontrack` handler to route each incoming track to the correct video element.

```typescript
// Client: attaches metadata to the offer
const metadata: TrackMetadata[] = [
  { kind: 'video', streamType: 'webcam', streamId: webcamStream.id },
  { kind: 'video', streamType: 'screen', streamId: screenStream.id },
];
socket.emit('offer', { sdp: offer, trackMetadata: metadata });

// Host: uses metadata in ontrack to identify streams
pc.ontrack = (event) => {
  const meta = trackMetadata.find(m => m.streamId === event.streams[0]?.id);
  const type = meta?.streamType ?? 'webcam';
  setRemoteStreams(prev => ({ ...prev, [type]: event.streams[0] }));
};
```

### 2. Timestamp Rendering (Canvas Pipeline)

**Challenge**: The requirement is to embed a live `HH:MM:SS` timestamp into the webcam video *before transmission*, so the host sees the timestamp directly in the video feed — not as a CSS overlay. This means the timestamp must be part of the video pixel data.

**Solution**: We implemented a **Canvas rendering pipeline**:

1. The raw webcam `MediaStream` is attached to a hidden `<video>` element
2. A `requestAnimationFrame` loop draws each video frame onto an `<canvas>`
3. After drawing the frame, we render the timestamp text on top using Canvas 2D context
4. `canvas.captureStream(30)` creates a new `MediaStream` from the canvas output
5. This stamped stream (not the raw webcam stream) is sent over WebRTC
6. Audio tracks from the original webcam stream are added to the stamped stream

This approach works because `captureStream()` creates a live video track that updates whenever the canvas is painted, effectively re-encoding the video with the timestamp burned in.

### 3. ICE Negotiation & Candidate Buffering

**Challenge**: ICE candidates can arrive via Socket.IO *before* the remote SDP description has been set on the `RTCPeerConnection`. Calling `addIceCandidate()` before `setRemoteDescription()` throws an error.

**Solution**: We implemented an **ICE candidate buffer**:

```typescript
const iceCandidateBuffer: RTCIceCandidateInit[] = [];

// When a candidate arrives:
if (pc.remoteDescription) {
  await pc.addIceCandidate(candidate); // Safe to add
} else {
  iceCandidateBuffer.push(candidate);  // Buffer for later
}

// After setRemoteDescription:
for (const candidate of iceCandidateBuffer) {
  await pc.addIceCandidate(candidate);
}
iceCandidateBuffer.length = 0;
```

This ensures no candidates are lost regardless of the order in which signaling messages arrive.

### 4. Stream Synchronization

**Challenge**: The webcam stream goes through a canvas pipeline (adding ~1 frame of latency), while the screen stream is sent directly. This can cause a slight desynchronization between the two streams on the host side.

**Solution**: 
- The canvas pipeline uses `requestAnimationFrame` which runs at the display's refresh rate (typically 60fps), keeping the processing latency to a single frame (~16ms)
- `captureStream(30)` matches the webcam's requested frame rate, preventing frame drops
- WebRTC's built-in jitter buffer handles minor timing differences at the transport level
- The single-frame canvas latency (~16ms) is imperceptible to human viewers

### 5. Browser Permission Handling

**Challenge**: `getUserMedia()` and `getDisplayMedia()` can fail in numerous ways: permission denied, device not found, device in use, overconstrained settings, user cancellation of the screen picker, etc. Each failure mode requires different user messaging.

**Solution**: Comprehensive error handling with user-friendly messages:

- **NotAllowedError**: "Camera permission was denied. Please allow camera access."
- **NotFoundError**: "No camera found. Please connect a camera."
- **NotReadableError**: "Camera is in use by another application."
- **OverconstrainedError**: Automatic retry with minimal constraints
- **AbortError** (screen share): "Screen sharing was cancelled." (treated as user intent, not an error)
- Track `ended` events: Detect when the user revokes permission or clicks "Stop sharing" in the browser's built-in UI

### 6. Single Peer Connection, Multiple Streams

**Challenge**: Using separate `RTCPeerConnection` instances for webcam and screen would double the ICE negotiation overhead and STUN queries. But a single connection requires careful track management.

**Solution**: All tracks (webcam video, webcam audio, screen video, screen audio) are added to a **single `RTCPeerConnection`**. Each track is associated with its respective `MediaStream` via the `addTrack(track, stream)` API. The stream IDs propagate to the host's `ontrack` event, where the metadata mapping identifies them.

Benefits:
- Single SDP negotiation round-trip
- Single ICE candidate gathering process
- Shared DTLS handshake
- Lower resource consumption

### 7. Hot Reload & React StrictMode Compatibility

**Challenge**: React StrictMode mounts/unmounts components twice in development. Socket.IO connections and WebRTC peer connections are stateful — double-mounting creates ghost connections.

**Solution**:
- Socket.IO client is a **singleton** (module-level variable in `socketService.ts`)
- `useEffect` cleanup functions properly disconnect sockets and close peer connections
- `useRef` holds mutable references to `RTCPeerConnection` and `MediaStream` instances, preventing re-creation on re-renders
- All event listeners are registered with named functions and properly removed in cleanup

---

## Performance Considerations

| Metric | Approach |
|---|---|
| Canvas rendering | `requestAnimationFrame` for 60fps vsync'd rendering |
| ICE gathering | `iceCandidatePoolSize: 10` for pre-gathering |
| Reconnection | Socket.IO exponential backoff (1s–5s) |
| Bundle size | Vite tree-shaking + code splitting per route |
| Memory | Proper `MediaStream.getTracks().stop()` on cleanup |
