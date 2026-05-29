/**
 * Backend type definitions for the signaling server.
 * These types define the shape of all Socket.IO event payloads
 * exchanged between client and host during WebRTC negotiation.
 */

/** Role a socket connection can assume */
export type UserRole = 'client' | 'host';

/** SDP offer/answer payload relayed between peers */
export interface SignalPayload {
  /** The SDP session description */
  sdp: RTCSessionDescriptionInit;
  /** Identifies the sender socket */
  senderId: string;
  /** Metadata about which tracks are included (e.g., stream IDs for webcam vs screen) */
  trackMetadata?: TrackMetadata[];
}

/** ICE candidate payload relayed between peers */
export interface IceCandidatePayload {
  /** The ICE candidate object */
  candidate: RTCIceCandidateInit;
  /** Identifies the sender socket */
  senderId: string;
}

/** Metadata attached to each media track so the host can identify webcam vs screen */
export interface TrackMetadata {
  /** The track's kind (audio or video) */
  kind: 'audio' | 'video';
  /** Stream label: 'webcam' or 'screen' */
  streamType: 'webcam' | 'screen';
  /** The MediaStream ID this track belongs to */
  streamId: string;
}

/** Information about a connected user in a room */
export interface ConnectedUser {
  socketId: string;
  role: UserRole;
  joinedAt: Date;
}

/** State of a streaming room */
export interface RoomState {
  /** Room identifier */
  roomId: string;
  /** Currently connected users */
  users: ConnectedUser[];
}

/**
 * Socket.IO event map for type-safe event handling.
 * Maps event names to their payload types.
 */
export interface ServerToClientEvents {
  offer: (payload: SignalPayload) => void;
  answer: (payload: SignalPayload) => void;
  'ice-candidate': (payload: IceCandidatePayload) => void;
  'user-connected': (data: { role: UserRole; socketId: string }) => void;
  'user-disconnected': (data: { role: UserRole; socketId: string }) => void;
}

export interface ClientToServerEvents {
  offer: (payload: SignalPayload) => void;
  answer: (payload: SignalPayload) => void;
  'ice-candidate': (payload: IceCandidatePayload) => void;
  'join-room': (data: { role: UserRole }) => void;
}
