const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#2980b9', '#c0392b', '#27ae60',
  '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#2c3e50'
];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'dist')));

// LAN discovery
let discovery = null;
try {
  discovery = require('./discovery');
} catch (_) {}

const users = new Map();

function broadcastUsers() {
  const list = [...users.values()].map((u) => u.username);
  io.emit('users', list);
}

io.on('connection', (socket) => {
  socket.on('join', (username) => {
    const name = String(username || 'Anon').trim().slice(0, 20);
    const color = randomColor();
    users.set(socket.id, { username: name, color });

    socket.emit('welcome', { yourId: socket.id, color });

    io.emit('message', {
      type: 'system',
      text: `${name} joined`,
      time: Date.now()
    });
    broadcastUsers();
  });

  socket.on('chat-message', (text) => {
    const user = users.get(socket.id);
    if (!user) return;
    const msg = String(text || '').trim();
    if (!msg) return;

    io.emit('message', {
      type: 'user',
      senderId: socket.id,
      username: user.username,
      color: user.color,
      text: msg,
      time: Date.now()
    });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      io.emit('message', {
        type: 'system',
        text: `${user.username} left`,
        time: Date.now()
      });
    }
    users.delete(socket.id);
    broadcastUsers();
  });
});

app.get('/health', (_req, res) => res.json({ ok: true, users: users.size }));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log('');

  if (discovery) {
    discovery.start(server, PORT);
    console.log('  LAN discovery active (auto-find on same network)');
  }

  console.log(`  Chat running at:\x1b[36m http://localhost:${PORT} \x1b[0m`);
  console.log(`  Share this  > \x1b[36m http://${ip}:${PORT} \x1b[0m`);
  console.log('');
});
