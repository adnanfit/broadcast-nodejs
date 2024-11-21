// Wait for DOM to be ready
document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const video = document.querySelector("video");
  const videoToggle = document.getElementById("video-toggle");
  const audioToggle = document.getElementById("audio-toggle");
  const stopBroadcast = document.getElementById("stop-broadcast");
  const videoStats = document.getElementById("video-stats");
  const audioStats = document.getElementById("audio-stats");
  const viewersCount = document.getElementById("viewers-count");
  const noViewersMessage = document.getElementById("no-viewers-message");

  // Validate required elements
  if (!video || !videoToggle || !audioToggle || !stopBroadcast) {
    console.error("Required elements not found in DOM");
    return;
  }

  const socket = io.connect(window.location.origin);
  const peerConnections = {};
  const config = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
    iceTransportPolicy: "all",
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
  };

  let stream = null;
  let connectedViewers = 0;

  const constraints = {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    audio: true,
  };

  // Media Control Functions
  function updateStreamStats() {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack && videoStats) {
        const settings = videoTrack.getSettings();
        videoStats.textContent = `${settings.height}p`;
        videoToggle.classList.toggle("active", videoTrack.enabled);
      }

      if (audioTrack && audioStats) {
        audioStats.textContent = "48kHz";
        audioToggle.classList.toggle("active", audioTrack.enabled);
      }
    }
  }

  function updateViewersUI() {
    if (viewersCount) {
      viewersCount.textContent = connectedViewers;
    }
    if (noViewersMessage) {
      noViewersMessage.classList.toggle("show", connectedViewers === 0);
    }
  }

  // Media Controls Event Listeners
  videoToggle.addEventListener("click", () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        videoToggle.classList.toggle("active", videoTrack.enabled);

        // Notify all connected peers about video state
        Object.keys(peerConnections).forEach((id) => {
          socket.emit("mediaStateChange", id, {
            type: "video",
            enabled: videoTrack.enabled,
          });
        });
      }
    }
  });

  audioToggle.addEventListener("click", () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        audioToggle.classList.toggle("active", audioTrack.enabled);

        // Notify all connected peers about audio state
        Object.keys(peerConnections).forEach((id) => {
          socket.emit("mediaStateChange", id, {
            type: "audio",
            enabled: audioTrack.enabled,
          });
        });
      }
    }
  });

  stopBroadcast.addEventListener("click", () => {
    if (confirm("Are you sure you want to stop broadcasting?")) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      socket.emit("broadcaster-disconnected");
      window.close();
    }
  });

  async function startBroadcast() {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      console.log("Local stream started");

      // Initialize media controls
      updateStreamStats();

      // Set up stream active monitoring
      if (stream.active) {
        updateStreamStats();
      }

      socket.emit("broadcaster");
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  }

  startBroadcast();

  // Socket Event Handlers
  socket.on("watcher", async (id) => {
    console.log(`New watcher connected: ${id}`);
    connectedViewers++;
    updateViewersUI();

    const peerConnection = new RTCPeerConnection(config);
    peerConnections[id] = peerConnection;

    if (stream) {
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
        console.log(`Added track: ${track.kind}`);
      });
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("candidate", id, event.candidate);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${peerConnection.iceConnectionState}`);
      if (
        peerConnection.iceConnectionState === "disconnected" ||
        peerConnection.iceConnectionState === "failed"
      ) {
        handlePeerDisconnection(id);
      }
    };

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await peerConnection.setLocalDescription(offer);
      socket.emit("offer", id, offer);
      console.log("Offer sent to watcher");
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  });

  socket.on("answer", async (id, description) => {
    const peerConnection = peerConnections[id];
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(description);
        console.log("Remote description set successfully");
      } catch (error) {
        console.error("Error setting remote description:", error);
      }
    }
  });

  socket.on("candidate", (id, candidate) => {
    const peerConnection = peerConnections[id];
    if (peerConnection) {
      peerConnection
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch((error) => console.error("Error adding ICE candidate:", error));
    }
  });

  function handlePeerDisconnection(id) {
    if (peerConnections[id]) {
      peerConnections[id].close();
      delete peerConnections[id];
      connectedViewers = Math.max(0, connectedViewers - 1);
      updateViewersUI();
    }
  }

  socket.on("disconnectPeer", (id) => {
    handlePeerDisconnection(id);
  });

  // Cleanup on page unload
  window.onunload = window.onbeforeunload = () => {
    socket.emit("broadcaster-disconnected");
    for (let id in peerConnections) {
      peerConnections[id].close();
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    socket.close();
  };

  // Periodically update stream stats
  setInterval(updateStreamStats, 5000);
});
