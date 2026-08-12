const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const path = require('path');

const PORT = 10000;

// 1. CONNECT TO MONGODB
mongoose.connect('mongodb+srv://chattyadmin:LkTYLCJVTHpwDrhy@cluster0.aa4ki7p.mongodb.net/chattydb')
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch(err => {
    console.log(err);
  });

// 2. MESSAGE SCHEMA
const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// 3. MIDDLEWARE - THIS IS WHAT SERVES YOUR HTML + CSS
app.use(express.static('public'));
app.use(express.json());

// 4. ROUTES
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API to load old messages
app.get('/api/messages', async (req, res) => {
  const messages = await Message.find().limit(50).sort({ createdAt: 1 });
  res.json(messages);
});

// 5. SOCKET.IO REALTIME CHAT
io.on('connection', (socket) => {
  console.log('a user connected');

  // When someone sends a message
  socket.on('chat message', async (msg) => {
    // Save to DB
    const newMessage = new Message(msg);
    await newMessage.save();
    
    // Send to everyone
    io.emit('chat message', msg);
  });

  // Typing indicator
  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data);
  });
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing');
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

http.listen(PORT, () => {
  console.log(`listening on http://localhost:${PORT}`);
});