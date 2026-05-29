/**
 * useWebRTC hook.
 * 
 * Central hook managing the RTCPeerConnection lifecycle for both
 * client (sender) and host (receiver) roles.
 * 
 * Client mode: adds local tracks → creates offer → sends via Socket.IO
 * Host mode: listens for offer → creates answer → receives remote tracks
 * 
 * Track identification uses stream IDs passed as metadata through signaling
 * so the host can distinguish webcam from screen share streams.
 */

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
  /** Current WebRTC connection state */
  connectionState: ConnectionState;
  /** Remote streams received (host mode only) */
  remoteStreams: RemoteStreams;
  /** Initiate WebRTC connection (client mode) */
  connect: (
    webcamStream: MediaStream,
    screenStream: MediaStream,
    audioStream: MediaStream | null
  ) => Promise<void>;
  /** Close the peer connection */
  disconnect: () => void;
}

/**
 * Hook for managing WebRTC peer connections.
 * 
 * @param socket - The Socket.IO client instance for signaling
 * @param role - Whether this peer is a 'client' (sender) or 'host' (receiver)
 * @param isSocketConnected - Whether the socket is currently connected
 */
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

  // Store track metadata so the host can map incoming tracks to stream types
  const trackMetadataRef = useRef<TrackMetadata[]>([]);
  // Buffer ICE candidates received before remote description is set
  const iceCandidateBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const isNegotiatingRef = useRef(false);

  /**
   * Flush any buffered ICE candidates after remote description is set.
   */
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

  /**
   * Set up a peer connection with common event handlers.
   */
  const setupPeerConnection = useCallback((): RTCPeerConnection => {
    // Close any existing connection
    if (pcRef.current) {
      closePeerConnection(pcRef.current);
    }

    const pc = createPeerConnection();
    pcRef.current = pc;

    // Monitor connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as ConnectionState;
      console.log(`[WebRTC] Connection state: ${state}`);
      setConnectionState(state);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
      // Map ICE states to our ConnectionState type for UI display
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionState('connected');
      } else if (pc.iceConnectionState === 'failed') {
        setConnectionState('failed');
      } else if (pc.iceConnectionState === 'disconnected') {
        setConnectionState('disconnected');
      }
    };

    // Send ICE candidates to the remote peer via signaling
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

  /**
   * CLIENT MODE: Add local tracks and create an SDP offer.
   * 
   * @param webcamStream - The timestamp-stamped webcam MediaStream
   * @param screenStream - The screen share MediaStream
   * @param audioStream - Optional separate audio stream (webcam audio)
   */
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

      // Add webcam video track (stamped canvas stream)
      webcamStream.getVideoTracks().forEach((track) => {
        pc.addTrack(track, webcamStream);
        metadata.push({
          kind: 'video',
          streamType: 'webcam',
          streamId: webcamStream.id,
        });
      });

      // Add audio from the original webcam stream
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
        // Create and send the SDP offer with track metadata
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

  /**
   * Close the peer connection and reset state.
   */
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

  /**
   * HOST MODE: Listen for signaling events and handle incoming streams.
   */
  useEffect(() => {
    if (!isSocketConnected) return;

    /**
     * Handle incoming SDP offer (host receives this from client).
     */
    const handleOffer = async (payload: SignalPayload) => {
      if (role !== 'host') return;

      console.log('[WebRTC] Received offer from client');
      setConnectionState('connecting');
      isNegotiatingRef.current = true;

      // Store the track metadata so we can identify streams in ontrack
      trackMetadataRef.current = payload.trackMetadata ?? [];

      const pc = setupPeerConnection();

      // Set up ontrack handler BEFORE setting remote description
      // This ensures we capture all tracks added during SDP processing
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
            // Check if this track is already in the stream
            if (!existing.getTrackById(event.track.id)) {
              existing.addTrack(event.track);
            }
            // Return a new MediaStream instance containing all current tracks
            // to ensure React detects the state update and triggers a re-render
            return {
              ...prev,
              [streamType]: new MediaStream(existing.getTracks()),
            };
          } else {
            // Use a new MediaStream instance to hold the incoming track
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

        // Flush any ICE candidates that arrived before the answer
        await flushIceCandidates();
      } catch (err) {
        console.error('[WebRTC] Error creating answer:', err);
        setConnectionState('failed');
      }
    };

    /**
     * Handle incoming SDP answer (client receives this from host).
     */
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

    /**
     * Handle incoming ICE candidates from the remote peer.
     * Buffer them if remote description hasn't been set yet.
     */
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
        // Buffer until remote description is set
        iceCandidateBufferRef.current.push(payload.candidate);
      }
    };

    /**
     * Handle peer disconnection — clean up streams.
     */
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
