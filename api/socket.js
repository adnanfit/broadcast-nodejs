const { Server } = require("socket.io");
const express = require("express");
const http = require("http");

const app = express();

// Store active connections
let broadcaster = null;
const viewers = new Set();

// Serve static files
app.use(express.static("public"));

// Middleware to log all socket events
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Handle connections
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

  // Send current state to newly connected client
  socket.emit("connection-state", {
    hasBroadcaster: !!broadcaster,
    viewerCount: viewers.size,
  });
});

function handleDisconnect(socket) {
  console.log(`Client disconnected: ${socket.id}`);

  if (socket.id === broadcaster) {
    console.log("Broadcaster disconnected");
    broadcaster = null;
    io.emit("broadcaster-disconnected");
    viewers.clear();
  } else if (viewers.has(socket.id)) {
    console.log(`Viewer disconnected: ${socket.id}`);
    viewers.delete(socket.id);
    if (broadcaster) {
      io.to(broadcaster).emit("disconnectPeer", socket.id);
    }
  }

  console.log(
    `Current state - Broadcaster: ${broadcaster}, Viewers: ${viewers.size}`
  );
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    broadcaster: !!broadcaster,
    viewers: viewers.size,
  });
});

// Serve the index route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Broadcast server" });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
});
