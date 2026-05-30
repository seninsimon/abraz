
import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import {
  createPeerConnection,
  createOffer,
  createAnswer,
  setRemoteAnswer,
  addIceCandidate,
  closePeerConnection,
} from '../services/webrtcService';
import type {
  ConnectionState,
  RemoteStreams,
  SignalPayload,
  IceCandidatePayload,
  TrackMetadata,
  UserRole,
} from '../types';

interface UseWebRTCReturn {
  connectionState: ConnectionState;
  remoteStreams: RemoteStreams;
  connect: (
    webcamStream: MediaStream,
    screenStream: MediaStream,
    audioStream: MediaStream | null
  ) => Promise<void>;
  disconnect: () => void;
}


export function useWebRTC(
  socket: Socket,
  role: UserRole,
  isSocketConnected: boolean
): UseWebRTCReturn {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreams>({
    webcam: null,
    screen: null,
  });

  const trackMetadataRef = useRef<TrackMetadata[]>([]);
  const iceCandidateBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const isNegotiatingRef = useRef(false);


  const flushIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;

    const candidates = iceCandidateBufferRef.current;
    iceCandidateBufferRef.current = [];

    for (const candidate of candidates) {
      try {
        await addIceCandidate(pc, candidate);
      } catch (err) {
        console.error('[WebRTC] Error adding buffered ICE candidate:', err);
      }
    }
  }, []);


  const setupPeerConnection = useCallback((): RTCPeerConnection => {
    if (pcRef.current) {
      closePeerConnection(pcRef.current);
    }

    const pc = createPeerConnection();
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as ConnectionState;
      console.log(`[WebRTC] Connection state: ${state}`);
      setConnectionState(state);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionState('connected');
      } else if (pc.iceConnectionState === 'failed') {
        setConnectionState('failed');
      } else if (pc.iceConnectionState === 'disconnected') {
        setConnectionState('disconnected');
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          candidate: event.candidate.toJSON(),
          senderId: socket.id ?? '',
        });
      }
    };

    return pc;
  }, [socket]);


  const connect = useCallback(
    async (
      webcamStream: MediaStream,
      screenStream: MediaStream,
      audioStream: MediaStream | null
    ) => {
      if (role !== 'client') {
        console.warn('[WebRTC] connect() should only be called in client mode');
        return;
      }

      setConnectionState('connecting');
      isNegotiatingRef.current = true;

      const pc = setupPeerConnection();
      const metadata: TrackMetadata[] = [];

      webcamStream.getVideoTracks().forEach((track) => {
        pc.addTrack(track, webcamStream);
        metadata.push({
          kind: 'video',
          streamType: 'webcam',
          streamId: webcamStream.id,
        });
      });

      if (audioStream) {
        audioStream.getAudioTracks().forEach((track) => {
          pc.addTrack(track, webcamStream);
          metadata.push({
            kind: 'audio',
            streamType: 'webcam',
            streamId: webcamStream.id,
          });
        });
      }

      // Add screen share tracks
      screenStream.getTracks().forEach((track) => {
        pc.addTrack(track, screenStream);
        metadata.push({
          kind: track.kind as 'audio' | 'video',
          streamType: 'screen',
          streamId: screenStream.id,
        });
      });

      trackMetadataRef.current = metadata;

      try {
        const offer = await createOffer(pc);
        socket.emit('offer', {
          sdp: offer,
          senderId: socket.id ?? '',
          trackMetadata: metadata,
        });
        console.log('[WebRTC] Offer sent with', metadata.length, 'tracks');
      } catch (err) {
        console.error('[WebRTC] Error creating offer:', err);
        setConnectionState('failed');
      }
    },
    [role, socket, setupPeerConnection]
  );


  const disconnect = useCallback(() => {
    if (pcRef.current) {
      closePeerConnection(pcRef.current);
      pcRef.current = null;
    }
    setConnectionState('closed');
    setRemoteStreams({ webcam: null, screen: null });
    iceCandidateBufferRef.current = [];
    isNegotiatingRef.current = false;
  }, []);


  useEffect(() => {
    if (!isSocketConnected) return;

    const handleOffer = async (payload: SignalPayload) => {
      if (role !== 'host') return;

      console.log('[WebRTC] Received offer from client');
      setConnectionState('connecting');
      isNegotiatingRef.current = true;

      trackMetadataRef.current = payload.trackMetadata ?? [];

      const pc = setupPeerConnection();
      pc.ontrack = (event: RTCTrackEvent) => {
        console.log(
          `[WebRTC] Received track: kind=${event.track.kind}, streamId=${event.streams[0]?.id}`
        );

        const incomingStreamId = event.streams[0]?.id;
        const meta = trackMetadataRef.current.find(
          (m) => m.streamId === incomingStreamId && m.kind === event.track.kind
        );

        const streamType = meta?.streamType ?? 'webcam';

        setRemoteStreams((prev) => {
          const existing = prev[streamType];
          if (existing) {
            if (!existing.getTrackById(event.track.id)) {
              existing.addTrack(event.track);
            }
            
            return {
              ...prev,
              [streamType]: new MediaStream(existing.getTracks()),
            };
          } else {
            return {
              ...prev,
              [streamType]: new MediaStream([event.track]),
            };
          }
        });
      };

      try {
        const answer = await createAnswer(pc, payload.sdp);
        socket.emit('answer', {
          sdp: answer,
          senderId: socket.id ?? '',
        });
        console.log('[WebRTC] Answer sent');

        await flushIceCandidates();
      } catch (err) {
        console.error('[WebRTC] Error creating answer:', err);
        setConnectionState('failed');
      }
    };

    const handleAnswer = async (payload: SignalPayload) => {
      if (role !== 'client') return;

      console.log('[WebRTC] Received answer from host');
      try {
        if (pcRef.current) {
          await setRemoteAnswer(pcRef.current, payload.sdp);
          await flushIceCandidates();
        }
      } catch (err) {
        console.error('[WebRTC] Error setting remote answer:', err);
        setConnectionState('failed');
      }
    };


    const handleIceCandidate = async (payload: IceCandidatePayload) => {
      const pc = pcRef.current;
      if (!pc) {
        iceCandidateBufferRef.current.push(payload.candidate);
        return;
      }

      if (pc.remoteDescription) {
        try {
          await addIceCandidate(pc, payload.candidate);
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      } else {
        iceCandidateBufferRef.current.push(payload.candidate);
      }
    };


    const handleUserDisconnected = () => {
      console.log('[WebRTC] Remote peer disconnected');
      disconnect();
    };

    // Register socket event listeners
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('user-disconnected', handleUserDisconnected);

    return () => {
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-disconnected', handleUserDisconnected);
    };
  }, [socket, role, isSocketConnected, setupPeerConnection, disconnect, flushIceCandidates]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        closePeerConnection(pcRef.current);
        pcRef.current = null;
      }
    };
  }, []);

  return {
    connectionState,
    remoteStreams,
    connect,
    disconnect,
  };
}
