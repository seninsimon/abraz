

export type UserRole = 'client' | 'host';

export interface SignalPayload {
  sdp: RTCSessionDescriptionInit;
  senderId: string;
  trackMetadata?: TrackMetadata[];
}

export interface IceCandidatePayload {
  candidate: RTCIceCandidateInit;
  senderId: string;
}

export interface TrackMetadata {
  kind: 'audio' | 'video';
  streamType: 'webcam' | 'screen';
  streamId: string;
}

export interface ConnectedUser {
  socketId: string;
  role: UserRole;
  joinedAt: Date;
  clientName?: string;
  token?: string;
}

export interface FrameSamplePayload {
  clientId: string;
  streamType: 'webcam' | 'screen';
  image: string; // base64 jpeg
  timestamp: number;
}

export interface FlagEventPayload {
  clientId: string;
  clientName: string;
  screenshot: string; // base64 or composite image
  label: string;
  timestamp: number;
}

export interface ServerToClientEvents {
  offer: (payload: SignalPayload) => void;
  answer: (payload: SignalPayload) => void;
  'ice-candidate': (payload: IceCandidatePayload) => void;
  'user-connected': (data: { role: UserRole; socketId: string; clientName?: string }) => void;
  'user-disconnected': (data: { role: UserRole; socketId: string }) => void;
  'set-stream-rate': (data: { mode: 'grid' | 'focus' }) => void;
  'terminate-meeting': () => void;
  'frame-sample-received': (data: { clientId: string; streamType: 'webcam' | 'screen'; timestamp: number }) => void;
}

export interface ClientToServerEvents {
  offer: (payload: SignalPayload) => void;
  answer: (payload: SignalPayload) => void;
  'ice-candidate': (payload: IceCandidatePayload) => void;
  'join-room': (data: { role: UserRole; token?: string; clientName?: string }) => void;
  'frame-sample': (payload: FrameSamplePayload) => void;
  'viewport-update': (data: { visibleClientIds: string[] }) => void;
  'set-client-rate': (data: { clientId: string; mode: 'grid' | 'focus' }) => void;
  'flag-event': (payload: FlagEventPayload) => void;
  'terminate-meeting': () => void;
}

