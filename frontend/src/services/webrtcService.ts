

import type { PeerConfig } from '../types';

const DEFAULT_CONFIG: PeerConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};


export function createPeerConnection(config?: PeerConfig): RTCPeerConnection {
  const rtcConfig: RTCConfiguration = {
    iceServers: config?.iceServers ?? DEFAULT_CONFIG.iceServers,
    iceCandidatePoolSize: 10,
  };

  return new RTCPeerConnection(rtcConfig);
}


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


export async function createAnswer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}


export async function setRemoteAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescriptionInit
): Promise<void> {
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}


export async function addIceCandidate(
  pc: RTCPeerConnection,
  candidate: RTCIceCandidateInit
): Promise<void> {
  if (candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
}


export function addTrack(
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  stream: MediaStream
): RTCRtpSender {
  return pc.addTrack(track, stream);
}

export function removeTrack(
  pc: RTCPeerConnection,
  sender: RTCRtpSender
): void {
  pc.removeTrack(sender);
}


export function closePeerConnection(pc: RTCPeerConnection): void {
  pc.close();
}
