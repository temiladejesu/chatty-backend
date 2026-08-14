const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');

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

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey'; // add this to .env later

// REGISTER
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: 'Username taken' });

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    
    res.json({ message: 'User created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid password' });

    // create token
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ message: 'Login successful', token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MIDDLEWARE to protect routes
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
// GET all messages - anyone can read
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: 1 }); // oldest first
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new message - only logged in users
app.post('/api/messages', auth, async (req, res) => { // 'auth' makes it protected
  try {
    const { text } = req.body;
    const newMessage = new Message({ 
      text, 
      username: req.user.username // this comes from the token
    });
    await newMessage.save();
    res.json(newMessage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});