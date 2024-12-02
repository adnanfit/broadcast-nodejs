const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Store active connections
let broadcaster = null;
const viewers = new Set();

// Serve static files
app.use(express.static("public"));

// Middleware to log all socket events
io.use((socket, next) => {
  console.log(`New connection attempt: ${socket.id}`);
  next();
});

function handleDisconnect(socket) {
  console.log(`Client disconnected: ${socket.id}`);

  if (socket.id === broadcaster) {
    console.log("Broadcaster disconnected");
    broadcaster = null;
    // Notify all viewers that broadcaster disconnected
    io.emit("broadcaster-disconnected");
    viewers.clear();
  } else if (viewers.has(socket.id)) {
    console.log(`Viewer disconnected: ${socket.id}`);
    viewers.delete(socket.id);
    // Notify broadcaster about viewer disconnection
    if (broadcaster) {
      io.to(broadcaster).emit("disconnectPeer", socket.id);
    }
  }

  // Log current state
  console.log(
    `Current state - Broadcaster: ${broadcaster}, Viewers: ${viewers.size}`
  );
}

io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Handle broadcaster connection
  socket.on("broadcaster", () => {
    broadcaster = socket.id;
    socket.broadcast.emit("broadcaster");
    console.log(`Broadcaster registered: ${broadcaster}`);
  });

  // Handle viewer connection
  socket.on("watcher", () => {
    if (!broadcaster) {
      socket.emit("no-broadcaster-available");
      console.log(
        `Viewer ${socket.id} attempted to connect but no broadcaster available`
      );
      return;
    }

    viewers.add(socket.id);
    socket.to(broadcaster).emit("watcher", socket.id);
    console.log(
      `Viewer registered: ${socket.id}, Total viewers: ${viewers.size}`
    );
  });

  // Handle WebRTC signaling
  socket.on("offer", (id, message) => {
    console.log(`Offer from ${socket.id} to ${id}`);
    socket.to(id).emit("offer", socket.id, message);
  });

  socket.on("answer", (id, message) => {
    console.log(`Answer from ${socket.id} to ${id}`);
    socket.to(id).emit("answer", socket.id, message);
  });

  socket.on("candidate", (id, message) => {
    console.log(`ICE candidate from ${socket.id} to ${id}`);
    socket.to(id).emit("candidate", socket.id, message);
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    handleDisconnect(socket);
  });

  // Handle explicit broadcaster disconnection
  socket.on("broadcaster-disconnected", () => {
    if (socket.id === broadcaster) {
      handleDisconnect(socket);
    }
  });

  // Handle connection errors
  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });

  // Send current state to newly connected client
  socket.emit("connection-state", {
    hasBroadcaster: !!broadcaster,
    viewerCount: viewers.size,
  });
});

// Error handling for the server
server.on("error", (error) => {
  console.error("Server error:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

const port = process.env.PORT || 5001;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`WebRTC signaling server ready`);
});

app.get("/", (req, res) => {
  res.json({ message: "Weclome to Broadcast" });
});
// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    broadcaster: !!broadcaster,
    viewers: viewers.size,
  });
});
