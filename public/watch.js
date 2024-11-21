document.addEventListener("DOMContentLoaded", () => {
  if (typeof io === "undefined") {
    console.error("Socket.IO client not loaded");
    return;
  }

  const socket = io.connect(window.location.origin);
  const video = document.getElementById("stream-video");
  const connectionDot = document.getElementById("connection-dot");
  const connectionText = document.getElementById("connection-text");
  const connectionMessage = document.getElementById("connection-message");
  const volumeToggle = document.getElementById("volume-toggle");
  const fullscreenToggle = document.getElementById("fullscreen-toggle");

  // Initially mute the video to allow autoplay
  video.muted = true;

  const config = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
  };

  let peerConnection;

  function updateConnectionStatus(status) {
    switch (status) {
      case "connecting":
        connectionDot.style.backgroundColor = "#ff9800";
        connectionText.textContent = "Connecting...";
        connectionMessage.classList.add("show");
        break;
      case "connected":
        connectionDot.style.backgroundColor = "#4CAF50";
        connectionText.textContent = "Connected";
        connectionMessage.classList.remove("show");
        break;
      case "disconnected":
        connectionDot.style.backgroundColor = "#ff4444";
        connectionText.textContent = "Disconnected";
        connectionMessage.classList.add("show");
        break;
    }
  }

  function createPeerConnection() {
    if (peerConnection) {
      peerConnection.close();
    }
    peerConnection = new RTCPeerConnection(config);

    peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        video.srcObject = event.streams[0];
        updateConnectionStatus("connected");
        handleVideoPlayback();
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("candidate", socket.id, event.candidate);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peerConnection.iceConnectionState);
      if (
        peerConnection.iceConnectionState === "failed" ||
        peerConnection.iceConnectionState === "disconnected"
      ) {
        reconnect();
      }
    };

    return peerConnection;
  }

  async function handleVideoPlayback() {
    try {
      // Always start muted
      video.muted = true;
      await video.play();
      showUnmuteMessage();
    } catch (error) {
      console.warn("Autoplay failed:", error);
      // Retry after a delay
      setTimeout(async () => {
        try {
          await video.play();
        } catch (retryError) {
          console.error("Retry failed:", retryError);
        }
      }, 1000);
    }
  }

  function reconnect() {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    updateConnectionStatus("connecting");
    socket.emit("watcher");
  }

  // Add UI elements for unmute message
  const unmuteMessage = document.createElement("div");
  unmuteMessage.className = "unmute-message";
  unmuteMessage.innerHTML = `
      <div class="unmute-content">
          <button id="unmute-button" class="control-button">
              <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/>
              </svg>
              Click to Unmute
          </button>
      </div>
  `;
  document.querySelector(".video-container").appendChild(unmuteMessage);

  // Style for unmute message
  const style = document.createElement("style");
  style.textContent = `
      .unmute-message {
          position: absolute;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.7);
          padding: 12px 24px;
          border-radius: 8px;
          z-index: 100;
          display: none;
      }
      .unmute-content {
          display: flex;
          align-items: center;
          gap: 8px;
          color: white;
      }
      #unmute-button {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: 1px solid white;
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.3s;
      }
      #unmute-button:hover {
          background: rgba(255, 255, 255, 0.1);
      }
  `;
  document.head.appendChild(style);

  function showUnmuteMessage() {
    unmuteMessage.style.display = "block";
  }

  function hideUnmuteMessage() {
    unmuteMessage.style.display = "none";
  }

  // Volume control handlers
  function updateVolumeIcon(isMuted) {
    volumeToggle.innerHTML = isMuted
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.5,12.43 16.5,12.21 16.5,12Z"/></svg>';
  }

  document.getElementById("unmute-button").addEventListener("click", () => {
    video.muted = false;
    hideUnmuteMessage();
    updateVolumeIcon(false);
  });

  volumeToggle.addEventListener("click", () => {
    video.muted = !video.muted;
    updateVolumeIcon(video.muted);
    if (video.muted) {
      showUnmuteMessage();
    } else {
      hideUnmuteMessage();
    }
  });

  // Fullscreen handler
  fullscreenToggle.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      fullscreenToggle.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5,16H8V19H10V14H5V16M8,8H5V10H10V5H8V8M14,19H16V16H19V14H14V19M16,8V5H14V10H19V8H16Z"/></svg>';
    } else {
      document.exitFullscreen();
      fullscreenToggle.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7,14H5V19H10V17H7V14M5,10H7V7H10V5H5V10M17,17H14V19H19V14H17V17M14,5V7H17V10H19V5H14Z"/></svg>';
    }
  });

  // Socket event handlers
  socket.on("connect", () => {
    updateConnectionStatus("connecting");
    socket.emit("watcher");
  });

  socket.on("offer", async (id, description) => {
    console.log(description, "description");
    try {
      peerConnection = createPeerConnection();
      await peerConnection.setRemoteDescription(description);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", id, answer);
    } catch (error) {
      console.error("Error handling offer:", error);
      reconnect();
    }
  });

  socket.on("candidate", async (id, candidate) => {
    try {
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  });

  socket.on("broadcaster-disconnected", () => {
    updateConnectionStatus("disconnected");
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  });

  socket.on("broadcaster", () => {
    console.log("New broadcaster available");
    reconnect();
  });

  // Auto-reconnection check
  setInterval(() => {
    if (
      !video.srcObject ||
      (peerConnection && peerConnection.iceConnectionState === "failed")
    ) {
      console.log("Connection check failed, attempting reconnection");
      reconnect();
    }
  }, 5000);

  // Cleanup
  window.onunload = window.onbeforeunload = () => {
    if (peerConnection) {
      peerConnection.close();
    }
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
    }
    socket.close();
  };

  // Initial video element check
  if (!video) {
    console.error("Video element not found");
  } else {
    video.addEventListener("loadedmetadata", () => {
      handleVideoPlayback();
    });
  }
});
