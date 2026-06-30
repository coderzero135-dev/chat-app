const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const multer = require('multer');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_MSG_PER_ROOM = 500;
const RATE_LIMIT_MS = 300;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_DIR = path.join(DATA_DIR, 'rooms');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
for (const d of [DATA_DIR, MESSAGES_DIR, UPLOADS_DIR]) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

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
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function roomPath(room) {
  return path.join(MESSAGES_DIR, `${sanitize(room)}.json`);
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'general';
}

async function loadMessages(room) {
  const rp = roomPath(room);
  try {
    if (fs.existsSync(rp)) {
      return JSON.parse(await fsp.readFile(rp, 'utf-8'));
    }
  } catch (e) {
    console.error(`[chat] failed to load messages for room ${room}:`, e.message);
  }
  return [];
}

async function saveMessages(room, msgs) {
  try {
    await fsp.writeFile(roomPath(room), JSON.stringify(msgs.slice(-MAX_MSG_PER_ROOM)));
  } catch (e) {
    console.error(`[chat] failed to save messages for room ${room}:`, e.message);
  }
}

function loadRoomList() {
  try {
    return fs.readdirSync(MESSAGES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch (_) { return []; }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(UPLOADS_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}${ext}`);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE }
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

let discovery = null;
try { discovery = require('./discovery'); } catch (_) {}

const users = new Map();        // socket.id -> { username, color, room }
const rooms = new Map();        // roomName -> Set of socket IDs
const typingTimers = new Map(); // roomName -> Map<socketId, username>
const lastMessageTime = new Map(); // socket.id -> timestamp for rate limiting

// Ensure "general" room exists
rooms.set('general', new Set());

io.on('connection', (socket) => {
  let currentRoom = 'general';

  socket.join('general');
  rooms.get('general').add(socket.id);

  socket.on('join', async (username) => {
    const name = String(username || 'Anon').trim().slice(0, 20);
    const color = randomColor();
    users.set(socket.id, { username: name, color, room: currentRoom });

    socket.emit('welcome', { yourId: socket.id, color });

    socket.emit('room-list', loadRoomList());
    socket.emit('load-messages', await loadMessages(currentRoom));
    broadcastRoomUsers(currentRoom);

    io.to(currentRoom).emit('message', {
      type: 'system',
      text: `${name} joined`,
      time: Date.now()
    });
  });

  socket.on('create-room', async (roomName) => {
    const name = sanitize(String(roomName || '').trim());
    if (!name) return;
    if (!rooms.has(name)) rooms.set(name, new Set());
    if (!fs.existsSync(roomPath(name))) {
      await saveMessages(name, []);
    }
    socket.emit('room-list', loadRoomList());
  });

  socket.on('join-room', async (roomName) => {
    const name = sanitize(String(roomName || '').trim());
    if (!name || name === currentRoom) return;
    if (!rooms.has(name)) rooms.set(name, new Set());

    const user = users.get(socket.id);

    // Leave current room
    socket.leave(currentRoom);
    rooms.get(currentRoom)?.delete(socket.id);
    if (user) {
      io.to(currentRoom).emit('message', {
        type: 'system',
        text: `${user.username} left`,
        time: Date.now()
      });
    }
    broadcastRoomUsers(currentRoom);

    // Join new room
    currentRoom = name;
    socket.join(name);
    rooms.get(name).add(socket.id);
    if (user) {
      user.room = name;
      socket.emit('load-messages', await loadMessages(name));
      io.to(name).emit('message', {
        type: 'system',
        text: `${user.username} joined`,
        time: Date.now()
      });
    }
    broadcastRoomUsers(name);
    socket.emit('room-list', loadRoomList());
  });

  socket.on('chat-message', async (text) => {
    const user = users.get(socket.id);
    if (!user) return;
    const msg = String(text || '').trim();
    if (!msg || msg.length > MAX_MESSAGE_LENGTH) return;

    const now = Date.now();
    const last = lastMessageTime.get(socket.id) || 0;
    if (now - last < RATE_LIMIT_MS) return;
    lastMessageTime.set(socket.id, now);

    const message = {
      id: now.toString(36) + Math.random().toString(36).slice(2, 7),
      type: 'user',
      senderId: socket.id,
      username: user.username,
      color: user.color,
      text: msg,
      time: now,
      reactions: {}
    };

    const messages = await loadMessages(currentRoom);
    messages.push(message);
    await saveMessages(currentRoom, messages);

    io.to(currentRoom).emit('message', message);
    clearTyping(socket.id, currentRoom);
  });

  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (!user) return;

    if (!typingTimers.has(currentRoom)) typingTimers.set(currentRoom, new Map());

    if (isTyping) {
      typingTimers.get(currentRoom).set(socket.id, user.username);
      broadcastTyping(currentRoom);
    } else {
      clearTyping(socket.id, currentRoom);
    }
  });

  socket.on('react', async ({ messageId, emoji }) => {
    const user = users.get(socket.id);
    if (!user || !messageId || !emoji) return;

    const messages = await loadMessages(currentRoom);
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};

    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(socket.id);
    if (idx >= 0) {
      msg.reactions[emoji].splice(idx, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push(socket.id);
    }

    await saveMessages(currentRoom, messages);
    io.to(currentRoom).emit('reaction-update', { messageId, reactions: msg.reactions });
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      clearTyping(socket.id, user.room);
      rooms.get(user.room)?.delete(socket.id);
      io.to(user.room).emit('message', {
        type: 'system',
        text: `${user.username} left`,
        time: Date.now()
      });
      broadcastRoomUsers(user.room);
    }
    users.delete(socket.id);
    lastMessageTime.delete(socket.id);
  });
});

function broadcastRoomUsers(room) {
  const list = [];
  rooms.get(room)?.forEach(sid => {
    const u = users.get(sid);
    if (u) list.push(u.username);
  });
  io.to(room).emit('room-users', { room, users: list });
}

function broadcastTyping(room) {
  const names = [];
  typingTimers.get(room)?.forEach(name => names.push(name));
  io.to(room).emit('typing-update', { room, users: names });
}

function clearTyping(socketId, room) {
  if (typingTimers.has(room)) {
    const roomTimers = typingTimers.get(room);
    roomTimers.delete(socketId);
    if (roomTimers.size === 0) typingTimers.delete(room);
    broadcastTyping(room);
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, users: users.size }));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log('');
  if (discovery) {
    discovery.start(server, PORT);
    console.log('  LAN discovery active');
  }
  console.log(`  Chat running at:\x1b[36m http://localhost:${PORT} \x1b[0m`);
  console.log(`  Share this  > \x1b[36m http://${ip}:${PORT} \x1b[0m`);
  console.log('');
});
