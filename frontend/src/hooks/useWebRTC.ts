
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
  remoteStreams: RemoteStreams; // Client-side local streams or active host stream
  remoteStreamsMap: Map<string, RemoteStreams>; // Host-side active remote streams map
  connect: (
    webcamStream: MediaStream,
    screenStream: MediaStream,
    audioStream: MediaStream | null
  ) => Promise<void>;
  disconnect: () => void;
  disconnectClient: (clientId: string) => void;
}

export function useWebRTC(
  socket: Socket,
  role: UserRole,
  isSocketConnected: boolean
): UseWebRTCReturn {
  // Client-side peer connection
  const pcRef = useRef<RTCPeerConnection | null>(null);
  
  // Host-side map of client connection peers
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  
  // Track metadata reference
  const trackMetadataRef = useRef<Map<string, TrackMetadata[]>>(new Map());

  // Local stream refs for dynamic constraint adjustment on client (3.1 & 4.1)
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>('new');
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreams>({
    webcam: null,
    screen: null,
  });
  
  // Host state storing all connected client streams
  const [remoteStreamsMap, setRemoteStreamsMap] = useState<Map<string, RemoteStreams>>(new Map());

  // ICE candidate buffer per senderId
  const iceCandidateBuffersRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Flush candidates helper
  const flushIceCandidates = useCallback(async (clientId: string) => {
    const pc = role === 'host' ? pcsRef.current.get(clientId) : pcRef.current;
    if (!pc || !pc.remoteDescription) return;

    const buffer = iceCandidateBuffersRef.current.get(clientId) || [];
    iceCandidateBuffersRef.current.set(clientId, []);

    for (const candidate of buffer) {
      try {
        await addIceCandidate(pc, candidate);
      } catch (err) {
        console.error(`[WebRTC] Error adding buffered ICE candidate for ${clientId}:`, err);
      }
    }
  }, [role]);

  // Setup connection helper
  const setupPeerConnection = useCallback((clientId: string): RTCPeerConnection => {
    const pc = createPeerConnection();

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as ConnectionState;
      console.log(`[WebRTC] Connection state for ${clientId}: ${state}`);
      if (role === 'client') {
        setConnectionState(state);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC] ICE connection state for ${clientId}: ${state}`);
      if (role === 'client') {
        if (state === 'connected' || state === 'completed') {
          setConnectionState('connected');
        } else if (state === 'failed') {
          setConnectionState('failed');
        } else if (state === 'disconnected') {
          setConnectionState('disconnected');
        }
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
  }, [socket, role]);

  // Client connect action (Uploads camera + screen with 2.5 Mbps constraints)
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
      webcamStreamRef.current = webcamStream;
      screenStreamRef.current = screenStream;

      const pc = setupPeerConnection('host');
      pcRef.current = pc;
      
      const metadata: TrackMetadata[] = [];

      // Add webcam video track
      webcamStream.getVideoTracks().forEach((track) => {
        const sender = pc.addTrack(track, webcamStream);
        metadata.push({
          kind: 'video',
          streamType: 'webcam',
          streamId: webcamStream.id,
        });

        // Cap webcam upload bandwidth to 800 Kbps (4.1 Client constraints)
        try {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];
          params.encodings[0].maxBitrate = 800000;
          sender.setParameters(params);
        } catch (e) {
          console.warn('[WebRTC] Error setting webcam sender parameters:', e);
        }
      });

      // Add audio track
      if (audioStream) {
        audioStream.getAudioTracks().forEach((track) => {
          const sender = pc.addTrack(track, webcamStream);
          metadata.push({
            kind: 'audio',
            streamType: 'webcam',
            streamId: webcamStream.id,
          });

          // Cap audio bandwidth to 64 Kbps
          try {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 64000;
            sender.setParameters(params);
          } catch (e) {
            console.warn('[WebRTC] Error setting audio sender parameters:', e);
          }
        });
      }

      // Add screen share tracks
      screenStream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, screenStream);
        metadata.push({
          kind: track.kind as 'audio' | 'video',
          streamType: 'screen',
          streamId: screenStream.id,
        });

        // Cap screen upload bandwidth to 1.5 Mbps (4.1 Client constraints)
        if (track.kind === 'video') {
          try {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 1500000;
            sender.setParameters(params);
          } catch (e) {
            console.warn('[WebRTC] Error setting screen sender parameters:', e);
          }
        }
      });

      trackMetadataRef.current.set('host', metadata);

      try {
        const offer = await createOffer(pc);
        socket.emit('offer', {
          sdp: offer,
          senderId: socket.id ?? '',
          trackMetadata: metadata,
        });
        console.log('[WebRTC] Offer sent with tracks. Bandwidth caps applied.');
      } catch (err) {
        console.error('[WebRTC] Error creating offer:', err);
        setConnectionState('failed');
      }
    },
    [role, socket, setupPeerConnection]
  );

  // Client disconnect
  const disconnect = useCallback(() => {
    if (pcRef.current) {
      closePeerConnection(pcRef.current);
      pcRef.current = null;
    }
    setConnectionState('closed');
    setRemoteStreams({ webcam: null, screen: null });
    iceCandidateBuffersRef.current.clear();
    webcamStreamRef.current = null;
    screenStreamRef.current = null;
  }, []);

  // Host disconnect client helper
  const disconnectClient = useCallback((clientId: string) => {
    const pc = pcsRef.current.get(clientId);
    if (pc) {
      closePeerConnection(pc);
      pcsRef.current.delete(clientId);
    }
    trackMetadataRef.current.delete(clientId);
    iceCandidateBuffersRef.current.delete(clientId);

    setRemoteStreamsMap((prev) => {
      const copy = new Map(prev);
      copy.delete(clientId);
      return copy;
    });
  }, []);

  // Dynamic framerate scaler based on smart grid state (3.1 & 4.1)
  const adjustLocalStreamRate = useCallback(async (mode: 'grid' | 'focus' | 'paused') => {
    console.log(`[WebRTC] Adjusting stream rate -> ${mode}`);
    const webcam = webcamStreamRef.current;
    const screen = screenStreamRef.current;

    if (mode === 'paused') {
      // Pause sending video tracks completely to conserve host/client CPU and bandwidth
      if (webcam) webcam.getVideoTracks().forEach(t => t.enabled = false);
      if (screen) screen.getVideoTracks().forEach(t => t.enabled = false);
      return;
    }

    if (webcam) webcam.getVideoTracks().forEach(t => t.enabled = true);
    if (screen) screen.getVideoTracks().forEach(t => t.enabled = true);

    const fps = mode === 'grid' ? 2 : 30; // 1-2 FPS for Grid view, 30 FPS for Focus view

    if (webcam) {
      for (const track of webcam.getVideoTracks()) {
        try {
          await track.applyConstraints({
            frameRate: { ideal: fps, max: fps }
          });
        } catch (err) {
          console.warn('[WebRTC] Failed to scale webcam track rate:', err);
        }
      }
    }

    if (screen) {
      for (const track of screen.getVideoTracks()) {
        try {
          await track.applyConstraints({
            frameRate: { ideal: fps, max: fps },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          });
        } catch (err) {
          console.warn('[WebRTC] Failed to scale screen track rate:', err);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!isSocketConnected) return;

    // In Host mode: accept offers from multiple client annotators
    const handleOffer = async (payload: SignalPayload) => {
      if (role !== 'host') return;

      const senderId = payload.senderId;
      console.log(`[WebRTC] Received offer from client: ${senderId}`);

      trackMetadataRef.current.set(senderId, payload.trackMetadata ?? []);

      // Clean up existing peer if any
      const existingPc = pcsRef.current.get(senderId);
      if (existingPc) {
        closePeerConnection(existingPc);
      }

      const pc = setupPeerConnection(senderId);
      pcsRef.current.set(senderId, pc);

      pc.ontrack = (event: RTCTrackEvent) => {
        console.log(
          `[WebRTC] Received track: kind=${event.track.kind}, streamId=${event.streams[0]?.id} from ${senderId}`
        );

        const incomingStreamId = event.streams[0]?.id;
        const metaList = trackMetadataRef.current.get(senderId) || [];
        const meta = metaList.find(
          (m) => m.streamId === incomingStreamId && m.kind === event.track.kind
        );

        const streamType = meta?.streamType ?? 'webcam';

        setRemoteStreamsMap((prev) => {
          const currentMap = new Map(prev);
          const currentStreams = currentMap.get(senderId) || { webcam: null, screen: null };

          const existingStream = currentStreams[streamType];
          if (existingStream) {
            if (!existingStream.getTrackById(event.track.id)) {
              existingStream.addTrack(event.track);
            }
            currentStreams[streamType] = new MediaStream(existingStream.getTracks());
          } else {
            currentStreams[streamType] = new MediaStream([event.track]);
          }

          currentMap.set(senderId, currentStreams);
          return currentMap;
        });
      };

      try {
        const answer = await createAnswer(pc, payload.sdp);
        socket.emit('answer', {
          sdp: answer,
          senderId: socket.id ?? '',
        });
        console.log(`[WebRTC] Answer sent to ${senderId}`);

        await flushIceCandidates(senderId);
      } catch (err) {
        console.error(`[WebRTC] Error creating answer for client ${senderId}:`, err);
      }
    };

    // In Client mode: accept answers from the Host
    const handleAnswer = async (payload: SignalPayload) => {
      if (role !== 'client') return;

      console.log('[WebRTC] Received answer from host');
      try {
        if (pcRef.current) {
          await setRemoteAnswer(pcRef.current, payload.sdp);
          await flushIceCandidates('host');
        }
      } catch (err) {
        console.error('[WebRTC] Error setting remote answer:', err);
        setConnectionState('failed');
      }
    };

    // Route ICE candidates to the correct RTCPeerConnection
    const handleIceCandidate = async (payload: IceCandidatePayload) => {
      const senderId = payload.senderId;
      const pc = role === 'host' ? pcsRef.current.get(senderId) : pcRef.current;
      const key = role === 'host' ? senderId : 'host';

      if (!pc) {
        let buffer = iceCandidateBuffersRef.current.get(key);
        if (!buffer) {
          buffer = [];
          iceCandidateBuffersRef.current.set(key, buffer);
        }
        buffer.push(payload.candidate);
        return;
      }

      if (pc.remoteDescription) {
        try {
          await addIceCandidate(pc, payload.candidate);
        } catch (err) {
          console.error(`[WebRTC] Error adding ICE candidate for ${key}:`, err);
        }
      } else {
        let buffer = iceCandidateBuffersRef.current.get(key);
        if (!buffer) {
          buffer = [];
          iceCandidateBuffersRef.current.set(key, buffer);
        }
        buffer.push(payload.candidate);
      }
    };

    // Handles remote client rate reduction/pauses (3.1 & 3.2 viewport aware smart grid)
    const handleSetStreamRate = (data: { mode: 'grid' | 'focus' | 'paused' }) => {
      adjustLocalStreamRate(data.mode);
    };

    // Listen for client disconnect
    const handleUserDisconnected = (data: { role: UserRole; socketId: string }) => {
      if (role === 'host') {
        console.log(`[WebRTC] Client disconnected: ${data.socketId}`);
        disconnectClient(data.socketId);
      } else {
        console.log('[WebRTC] Host disconnected from room.');
        disconnect();
      }
    };

    // Register event listeners
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('set-stream-rate', handleSetStreamRate);
    socket.on('user-disconnected', handleUserDisconnected);

    return () => {
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('set-stream-rate', handleSetStreamRate);
      socket.off('user-disconnected', handleUserDisconnected);
    };
  }, [
    socket,
    role,
    isSocketConnected,
    setupPeerConnection,
    disconnect,
    disconnectClient,
    flushIceCandidates,
    adjustLocalStreamRate
  ]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        closePeerConnection(pcRef.current);
      }
      pcsRef.current.forEach((pc) => {
        closePeerConnection(pc);
      });
      pcsRef.current.clear();
    };
  }, []);

  return {
    connectionState,
    remoteStreams,
    remoteStreamsMap,
    connect,
    disconnect,
    disconnectClient,
  };
}

