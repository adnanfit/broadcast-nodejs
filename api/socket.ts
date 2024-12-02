import { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from 'socket.io';
import { createServer } from 'http';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Store active connections
let broadcaster: string | null = null;
const viewers = new Set<string>();

// Handle socket connections
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Handle broadcaster connection
  socket.on('broadcaster', () => {
    broadcaster = socket.id;
    socket.broadcast.emit('broadcaster');
    console.log(`Broadcaster registered: ${broadcaster}`);
  });

  // Handle viewer connection
  socket.on('watcher', () => {
    if (!broadcaster) {
      socket.emit('no-broadcaster-available');
      console.log(`Viewer ${socket.id} attempted to connect but no broadcaster available`);
      return;
    }

    viewers.add(socket.id);
    socket.to(broadcaster).emit('watcher', socket.id);
    console.log(`Viewer registered: ${socket.id}, Total viewers: ${viewers.size}`);
  });

  // Handle WebRTC signaling
  socket.on('offer', (id, message) => {
    console.log(`Offer from ${socket.id} to ${id}`);
    socket.to(id).emit('offer', socket.id, message);
  });

  socket.on('answer', (id, message) => {
    console.log(`Answer from ${socket.id} to ${id}`);
    socket.to(id).emit('answer', socket.id, message);
  });

  socket.on('candidate', (id, message) => {
    console.log(`ICE candidate from ${socket.id} to ${id}`);
    socket.to(id).emit('candidate', socket.id, message);
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });

  // Send current state to newly connected client
  socket.emit('connection-state', {
    hasBroadcaster: !!broadcaster,
    viewerCount: viewers.size,
  });
});

function handleDisconnect(socket: { id: string }) {
  console.log(`Client disconnected: ${socket.id}`);

  if (socket.id === broadcaster) {
    console.log('Broadcaster disconnected');
    broadcaster = null;
    io.emit('broadcaster-disconnected');
    viewers.clear();
  } else if (viewers.has(socket.id)) {
    console.log(`Viewer disconnected: ${socket.id}`);
    viewers.delete(socket.id);
    if (broadcaster) {
      io.to(broadcaster).emit('disconnectPeer', socket.id);
    }
  }

  console.log(`Current state - Broadcaster: ${broadcaster}, Viewers: ${viewers.size}`);
}

// Health check endpoint
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET' && req.url === '/health') {
    res.json({
      status: 'healthy',
      broadcaster: !!broadcaster,
      viewers: viewers.size,
    });
  } else if (req.method === 'GET' && req.url === '/') {
    res.json({ message: 'Welcome to Broadcast server' });
  } else {
    res.status(404).send('Not Found');
  }
}

// Start the HTTP server for WebSocket connections
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on port ${PORT}`);
});
