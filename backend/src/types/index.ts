

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
}

export interface RoomState {
  roomId: string;
  users: ConnectedUser[];
}

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
