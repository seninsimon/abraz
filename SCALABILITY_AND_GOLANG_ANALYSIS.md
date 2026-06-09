# Scalability & Golang Transition Analysis

This document evaluates whether the current **DualStream** architecture can support **200 concurrent streaming users** with good performance, explains its scalability bottlenecks, and addresses whether switching the backend to **Golang** is the right solution.

---

## 📊 Quick Answer

* **Can you stream 200 concurrent users with the current codebase?**
  **No.** The current implementation is a prototype designed for 1-to-1 WebRTC connections (one host to one client) using a static signaling room. Even if modified to support multiple peers in a standard WebRTC Peer-to-Peer (P2P) mesh topology, it would crash client devices long before reaching 200 users.
* **Is this project scalable in its current state?**
  **No.** It is a local proof-of-concept. Scaling it requires moving from a P2P mesh topology to an **SFU (Selective Forwarding Unit)** architecture, introducing dynamic rooms, deploying TURN servers, and scaling the signaling layer.
* **Should you switch to Golang?**
  **Yes and No (depending on where).** 
  * **No for the Signaling Server:** Switching the Node.js/Socket.io signaling server to Golang won't solve the bottleneck. Node.js is more than fast enough to handle signaling messages (SDP/ICE) for thousands of users.
  * **Yes for the Media Infrastructure:** If you decide to build a custom **SFU media server** yourself, Golang (via the **Pion WebRTC** library) is the industry-standard choice. However, using a pre-built SFU (like **LiveKit**, which is built in Go, or **Mediasoup**, built in Node.js/C++) is recommended over writing one from scratch.

---

## 🛠️ The Bottlenecks in the Current Architecture

### 1. Peer-to-Peer (P2P) Mesh Topology Limits
Currently, the app relies on a direct WebRTC connection between browsers. In a multi-user P2P mesh setup, every participant connects directly to every other participant.

* **Connection Complexity:** $O(N^2)$ connections. For 200 users, the total connections would be:
  $$\frac{N \times (N - 1)}{2} = \frac{200 \times 199}{2} = 19,900 \text{ connections}$$
* **Client Overhead:** Each of the 200 users would have to establish **199 separate peer connections**, encode/upload their media stream **199 times**, and download/decode **199 incoming streams**.
* **Result:** Browser tabs will freeze and crash due to CPU exhaustion, and the upload bandwidth requirement will exceed typical home or cellular internet capabilities within the first 5-10 users.

### 2. Static Signaling Room
The backend is hardcoded to a single room:
```typescript
const ROOM_ID = 'stream-room';
```
Any user who connects is thrown into the same room. A second client connecting overrides the peer connection of the first client, making multi-session streaming impossible.

---

## 💡 How to Scale to 200+ Users

To scale to 200 concurrent users, the application must transition to an **SFU (Selective Forwarding Unit)** architecture.

```
P2P MESH (Current: High Client Upload)     SFU ARCHITECTURE (Scalable: Low Client Upload)

     ┌─── Peer 1 (Upload: 3Mbps)                 ┌─── Viewer 1 (Download: 1.5Mbps)
     │                                           │
Streamer ─── Peer 2 (Upload: 3Mbps)       Streamer ───► SFU Server ─── Viewer 2 (Download: 1.5Mbps)
     │                                     (1 Upload Stream)
     └─── Peer 3 (Upload: 3Mbps)                 │
                                                 └─── Viewer 3 (Download: 1.5Mbps)
Total Streamer Upload: 9 Mbps              Total Streamer Upload: 1.5 Mbps
```

### 1. Integrate an SFU Media Server
Instead of peers connecting directly to each other, they connect to a centralized media server:
* **The Streamer** sends their audio/video tracks to the SFU exactly **once** (1 upload stream).
* **The SFU** routes/forwards those tracks to all 199 viewers.
* **Result:** The streamer's upload bandwidth remains constant, regardless of whether there are 2 viewers or 2,000 viewers.

#### Recommended SFUs:
1. **LiveKit (Recommended):**
   * Written in **Golang**.
   * Out-of-the-box support for React and Node.js.
   * Scalable, cloud-native, and handles room management, ICE, and TURN automatically.
2. **Mediasoup:**
   * Node.js module wrapping a highly optimized C++ worker process.
   * Extremely low overhead, but requires writing your own room management logic.

### 2. Dynamic Room Management
Introduce dynamic room IDs so multiple sessions can exist simultaneously:
* Update React router to use `/room/:roomId`.
* Pass `roomId` during Socket.io connection handshakes and segment signaling events on the server using `socket.to(roomId)`.

### 3. Deploy TURN Servers
About 30%–50% of real-world WebRTC connections fail without a **TURN** (Traversal Using Relays around NAT) server due to symmetric NATs (cellular data, corporate firewalls). You must deploy a service like **Coturn** or use a managed service like Twilio or Cloudflare Calls to relay media packets when direct P2P connections are blocked.

---

## 🐹 Should You Switch to Golang?

Let's break down where Golang shines and where your current stack is already sufficient.

### 1. The Signaling Server (Node.js vs. Golang)
The signaling server's only job is to relay SDP offers, answers, and ICE candidates (essentially acting as a JSON mailbox).
* **Node.js + Socket.io** can easily handle 10,000+ concurrent WebSocket connections when properly configured.
* Switching this layer to Go (using Gorilla WebSocket or Gin) will improve memory usage and raw CPU throughput, but it **will not solve the WebRTC performance bottleneck**, because the bottleneck is the media traffic, not the signaling messages.
* **Verdict:** Keep Node.js for signaling, orchestration, and API logic to maintain high developer velocity.

### 2. The Media Server (Why Go is Great)
If you decide to write custom media routing logic (e.g. custom SFU, SIP gateways, recording systems):
* **Golang is the dominant language** in modern WebRTC infrastructure due to [Pion WebRTC](https://github.com/pion/webrtc), a pure Go implementation of the WebRTC stack.
* Go offers native concurrency (goroutines), low memory footprint, and high-performance network handling.
* **Verdict:** If you are building a custom SFU from scratch, use Go with Pion. If you want a fast, production-ready solution, use **LiveKit** (which is built in Go, but you can control it using Node.js or React SDKs).

---

## 📋 Recommended Action Plan

To scale this project to support 200 concurrent viewers, follow this phased plan:

| Phase | Action | Technology | Benefit |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Migrate from P2P to **LiveKit** | LiveKit Cloud / Self-hosted LiveKit (Go) | Eliminates client upload bottleneck; handles media routing. |
| **Phase 2** | Dynamic Room IDs | React Router + LiveKit token exchange | Enables multiple parallel streaming sessions. |
| **Phase 3** | Deploy TURN Infrastructure | Coturn or Cloudflare Calls | Guarantees connection stability across cellular and corporate networks. |
| **Phase 4** | Scale Signaling | Redis adapter for Socket.io | Allows clustering the signaling server across multiple instances. |
