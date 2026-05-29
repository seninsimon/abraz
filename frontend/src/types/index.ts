/**
 * Frontend type definitions.
 * Shared types for WebRTC, Socket.IO, and component props.
 */

/** Possible WebRTC connection states displayed in the UI */
export type ConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/** Identifies the type of media stream */
export type StreamType = 'webcam' | 'screen';

/** Metadata sent alongside SDP to identify tracks */
export interface TrackMetadata {
  kind: 'audio' | 'video';
  streamType: StreamType;
  streamId: string;
}

/** SDP offer/answer payload */
export interface SignalPayload {
  sdp: RTCSessionDescriptionInit;
  senderId: string;
  trackMetadata?: TrackMetadata[];
}

/** ICE candidate payload */
export interface IceCandidatePayload {
  candidate: RTCIceCandidateInit;
  senderId: string;
}

/** User role in the streaming session */
export type UserRole = 'client' | 'host';

/** WebRTC peer configuration */
export interface PeerConfig {
  iceServers: RTCIceServer[];
}

/** Remote streams received by the host */
export interface RemoteStreams {
  webcam: MediaStream | null;
  screen: MediaStream | null;
}

/** Props for the VideoPlayer component */
export interface VideoPlayerProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  className?: string;
}

/** Props for the ConnectionStatus component */
export interface ConnectionStatusProps {
  state: ConnectionState;
  className?: string;
}

/** Props for the TimestampCanvas component */
export interface TimestampCanvasProps {
  sourceStream: MediaStream | null;
  onStampedStream: (stream: MediaStream) => void;
  className?: string;
}
