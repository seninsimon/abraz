/**
 * WebRTC service module.
 * 
 * Provides factory functions for creating and managing RTCPeerConnection
 * instances. Encapsulates STUN server configuration and SDP negotiation helpers.
 */

import type { PeerConfig } from '../types';

/** Default STUN server configuration for ICE candidate gathering */
const DEFAULT_CONFIG: PeerConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

/**
 * Creates a new RTCPeerConnection with STUN server configuration.
 * @param config Optional override for ICE server config
 */
export function createPeerConnection(config?: PeerConfig): RTCPeerConnection {
  const rtcConfig: RTCConfiguration = {
    iceServers: config?.iceServers ?? DEFAULT_CONFIG.iceServers,
    // Use all available ICE candidates for best connectivity
    iceCandidatePoolSize: 10,
  };

  return new RTCPeerConnection(rtcConfig);
}

/**
 * Creates an SDP offer from the peer connection.
 * The offer is automatically set as the local description.
 */
export async function createOffer(
  pc: RTCPeerConnection
): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  });
  await pc.setLocalDescription(offer);
  return offer;
}

/**
 * Creates an SDP answer after setting the remote offer.
 * The answer is automatically set as the local description.
 */
export async function createAnswer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

/**
 * Sets the remote SDP answer on the peer connection.
 */
export async function setRemoteAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescriptionInit
): Promise<void> {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

/**
 * Adds a received ICE candidate to the peer connection.
 * Silently ignores if the candidate is null (end-of-candidates signal).
 */
export async function addIceCandidate(
  pc: RTCPeerConnection,
  candidate: RTCIceCandidateInit
): Promise<void> {
  if (candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

/**
 * Adds a media track to the peer connection.
 * @returns The RTCRtpSender for the added track
 */
export function addTrack(
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  stream: MediaStream
): RTCRtpSender {
  return pc.addTrack(track, stream);
}

/**
 * Removes a track sender from the peer connection.
 */
export function removeTrack(
  pc: RTCPeerConnection,
  sender: RTCRtpSender
): void {
  pc.removeTrack(sender);
}

/**
 * Closes the peer connection and cleans up all resources.
 */
export function closePeerConnection(pc: RTCPeerConnection): void {
  pc.close();
}
