const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

require('dotenv').config();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// 1. CONNECT TO MONGODB
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://chattyadmin:Y6bg1fuB1YrjHqH0@cluster0.aa4ki7p.mongodb.net/chattydb')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log(err));

// 2. SCHEMAS
const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// 3. ROUTES
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/messages', async (req, res) => {
  const messages = await Message.find().limit(50).sort({ createdAt: 1 });
  res.json(messages);
});

app.get('/api/users', async (req, res) => {
  const users = await User.find().select('-__v');
  res.json(users);
});

// 4. SOCKET.IO
io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('chat message', async (msg) => {
    const newMessage = new Message(msg);
    await newMessage.save();
    io.emit('chat message', msg);
  });

  socket.on('typing', (data) => socket.broadcast.emit('typing', data));
  socket.on('stop typing', () => socket.broadcast.emit('stop typing'));
  socket.on('disconnect', () => console.log('user disconnected'));
});

http.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});