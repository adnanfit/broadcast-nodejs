const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const serverless = require("serverless-http");

const app = express();
const server = http.createServer(app);

server.setMaxListeners(20);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

let broadcaster = null;
const viewers = new Set();

io.use((socket, next) => {
  console.log(`New connection attempt: ${socket.id}`);
  next();
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

io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);

  socket.on("broadcaster", () => {
    broadcaster = socket.id;
    socket.broadcast.emit("broadcaster");
    console.log(`Broadcaster registered: ${broadcaster}`);
  });

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

  socket.on("disconnect", () => {
    handleDisconnect(socket);
  });

  socket.on("broadcaster-disconnected", () => {
    if (socket.id === broadcaster) {
      handleDisconnect(socket);
    }
  });

  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });

  socket.emit("connection-state", {
    hasBroadcaster: !!broadcaster,
    viewerCount: viewers.size,
  });
});

server.on("error", (error) => {
  console.error("Server error:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    broadcaster: !!broadcaster,
    viewers: viewers.size,
  });
});

// Export the handler for Netlify Lambda
module.exports.handler = serverless(app);
