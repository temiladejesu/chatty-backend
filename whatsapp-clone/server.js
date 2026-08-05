// server.js
// WhatsApp-style real-time chat backend: Express (REST) + Socket.io (real-time) + JWT auth.

const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------- Helpers ----------

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, avatarColor: u.avatarColor };
}

function makeToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function conversationId(userA, userB) {
  return [userA, userB].sort((a, b) => a - b).join('_');
}

function randomColor() {
  const colors = ['#25D366', '#128C7E', '#34B7F1', '#ECE5DD', '#F44336', '#9C27B0', '#FF9800', '#00BCD4'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ---------- REST: Auth ----------

app.post('/api/register', (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'username, password and name are required' });
  }
  const users = db.getUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const user = {
    id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
    username,
    name,
    passwordHash: bcrypt.hashSync(password, 10),
    avatarColor: randomColor(),
    createdAt: Date.now(),
  };
  users.push(user);
  db.saveUsers(users);
  res.json({ token: makeToken(user), user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const users = db.getUsers();
  const user = users.find(u => u.username.toLowerCase() === (username || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({ token: makeToken(user), user: publicUser(user) });
});

// ---------- REST: Users / Contacts ----------

app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.getUsers().filter(u => u.id !== req.user.id).map(publicUser);
  res.json(users);
});

// ---------- REST: Message history ----------

app.get('/api/messages/:otherUserId', authMiddleware, (req, res) => {
  const otherId = parseInt(req.params.otherUserId, 10);
  const convoId = conversationId(req.user.id, otherId);
  const messages = db.getMessages().filter(m => m.convoId === convoId);
  res.json(messages);
});

// ---------- Socket.io real-time layer ----------

const onlineUsers = new Map(); // userId -> Set of socket ids

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('Missing auth token'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    next(new Error('Invalid auth token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;

  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);

  socket.join(`user:${userId}`);
  io.emit('presence', { userId, online: true });

  socket.on('private_message', ({ toUserId, text }) => {
    if (!toUserId || !text || !text.trim()) return;
    const convoId = conversationId(userId, toUserId);
    const message = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      convoId,
      from: userId,
      to: toUserId,
      text: text.trim(),
      timestamp: Date.now(),
      status: 'sent',
    };
    const messages = db.getMessages();
    messages.push(message);
    db.saveMessages(messages);

    io.to(`user:${toUserId}`).emit('new_message', message);
    io.to(`user:${userId}`).emit('new_message', message); // echo back to sender's other tabs
  });

  socket.on('typing', ({ toUserId }) => {
    io.to(`user:${toUserId}`).emit('typing', { fromUserId: userId });
  });

  socket.on('stop_typing', ({ toUserId }) => {
    io.to(`user:${toUserId}`).emit('stop_typing', { fromUserId: userId });
  });

  socket.on('mark_read', ({ otherUserId }) => {
    const convoId = conversationId(userId, otherUserId);
    const messages = db.getMessages();
    let changed = false;
    messages.forEach(m => {
      if (m.convoId === convoId && m.to === userId && m.status !== 'read') {
        m.status = 'read';
        changed = true;
      }
    });
    if (changed) {
      db.saveMessages(messages);
      io.to(`user:${otherUserId}`).emit('messages_read', { byUserId: userId });
    }
  });

  socket.on('disconnect', () => {
    const set = onlineUsers.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(userId);
        io.emit('presence', { userId, online: false });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Chat server running at http://localhost:${PORT}`);
});
