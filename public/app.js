// app.js — frontend logic for the chat app.
const API = 'https://chatty-backend-1-jp3h.onrender.com';
let state = {
  token: localStorage.getItem('chatty_token') || null,
  me: JSON.parse(localStorage.getItem('chatty_me') || 'null'),
  contacts: [],
  activeContact: null,
  messagesByUser: {}, // userId -> [messages]
  onlineUserIds: new Set(),
  typingTimeout: null,
};

let socket = null;

// ---------- DOM refs ----------
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

const myAvatar = document.getElementById('my-avatar');
const myName = document.getElementById('my-name');
const logoutBtn = document.getElementById('logout-btn');
const contactSearch = document.getElementById('contact-search');
const contactList = document.getElementById('contact-list');

const chatEmpty = document.getElementById('chat-empty');
const chatActive = document.getElementById('chat-active');
const chatAvatar = document.getElementById('chat-avatar');
const chatName = document.getElementById('chat-name');
const chatStatus = document.getElementById('chat-status');
const messagesEl = document.getElementById('messages');
const typingIndicator = document.getElementById('typing-indicator');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

// ---------- Helpers ----------

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function setAvatar(el, user) {
  el.textContent = initials(user.name || user.username);
  el.style.background = user.avatarColor || '#128C7E';
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: Bearer ${state.token} };
}

// ---------- Auth screen wiring ----------

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const res = await fetch(${API}/api/login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    onAuthSuccess(data);
  } catch (err) {
    loginError.textContent = err.message;
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const name = document.getElementById('register-name').value.trim();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  try {
    const res = await fetch(${API}/api/register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    onAuthSuccess(data);
  } catch (err) {
    registerError.textContent = err.message;
  }
});

function onAuthSuccess({ token, user }) {
  state.token = token;
  state.me = user;
  localStorage.setItem('chatty_token', token);
  localStorage.setItem('chatty_me', JSON.stringify(user));
  enterApp();
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('chatty_token');
  localStorage.removeItem('chatty_me');
  if (socket) socket.disconnect();
  state = {...state, token: null, me: null, contacts: [], activeContact: null, messagesByUser: {} };
  appScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
});

// ---------- Entering the app ----------

async function enterApp() {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');

  setAvatar(myAvatar, state.me);
  myName.textContent = state.me.name;

  await loadContacts();
  connectSocket();
}

async function loadContacts() {
  const res = await fetch(${API}/api/users, { headers: authHeaders() });
  state.contacts = await res.json();
  renderContactList();
}

function renderContactList(filter = '') {
  contactList.innerHTML = '';
  const filtered = state.contacts.filter(c =>
    c.name.toLowerCase().includes(filter.toLowerCase()) ||
    c.username.toLowerCase().includes(filter.toLowerCase())
  );

  filtered.forEach(contact => {
    const li = document.createElement('li');
    li.className = 'contact-item' + (state.activeContact && state.activeContact.id === contact.id? ' active' : '');

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    setAvatar(avatar, contact);
    li.appendChild(avatar);

    if (state.onlineUserIds.has(contact.id)) {
      const dot = document.createElement('span');
      dot.className = 'online-dot';
      li.appendChild(dot);
    }

    const info = document.createElement('div');
    info.className = 'contact-item-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'contact-item-name';
    nameEl.textContent = contact.name;
    const lastMsgs = state.messagesByUser[contact.id] || [];
    const sub = document.createElement('div');
    sub.className = 'contact-item-sub';
    sub.textContent = lastMsgs.length? lastMsgs[lastMsgs.length - 1].text : @${contact.username};
    info.appendChild(nameEl);
    info.appendChild(sub);
    li.appendChild(info);

    li.addEventListener('click', () => openConversation(contact));
    contactList.appendChild(li);
  });
}

contactSearch.addEventListener('input', () => renderContactList(contactSearch.value));

// ---------- Socket.io ----------

function connectSocket() {
  socket = io(API, { auth: { token: state.token } });

  socket.on('presence', ({ userId, online }) => {
    if (online) state.onlineUserIds.add(userId);
    else state.onlineUserIds.delete(userId);
    renderContactList(contactSearch.value);
    if (state.activeContact && state.activeContact.id === userId) updateChatStatus();
  });

  socket.on('new_message', (message) => {
    const otherId = message.from === state.me.id? message.to : message.from;
    if (!state.messagesByUser[otherId]) state.messagesByUser[otherId] = [];
    state.messagesByUser[otherId].push(message);

    if (state.activeContact && state.activeContact.id === otherId) {
      renderMessages();
      if (message.to === state.me.id) socket.emit('mark_read', { otherUserId: otherId });
    }
    renderContactList(contactSearch.value);
  });

  socket.on('typing', ({ fromUserId }) => {
    if (state.activeContact && state.activeContact.id === fromUserId) {
      typingIndicator.classList.remove('hidden');
    }
  });

  socket.on('stop_typing', ({ fromUserId }) => {
    if (state.activeContact && state.activeContact.id === fromUserId) {
      typingIndicator.classList.add('hidden');
    }
  });
 socket.on('messages_read', ({ byUserId }) => {
    if (state.activeContact && state.activeContact.id === byUserId) {
      (state.messagesByUser[byUserId] || []).forEach(m => {
        if (m.from === state.me.id) m.status = 'read';
      });
      renderMessages();
    }
  });
}

// ---------- Conversation view ----------

async function openConversation(contact) {
  state.activeContact = contact;
  chatEmpty.classList.add('hidden');
  chatActive.classList.remove('hidden');

  setAvatar(chatAvatar, contact);
  chatName.textContent = contact.name;
  updateChatStatus();
  renderContactList(contactSearch.value);

  if (!state.messagesByUser[contact.id]) {
    const res = await fetch(${API}/api/messages/${contact.id}, { headers: authHeaders() });
    state.messagesByUser[contact.id] = await res.json();
  }
  renderMessages();
  socket.emit('mark_read', { otherUserId: contact.id });
  messageInput.focus();
}

function updateChatStatus() {
  chatStatus.textContent = state.onlineUserIds.has(state.activeContact.id)? 'online' : 'offline';
}

function renderMessages() {
  const msgs = state.messagesByUser[state.activeContact.id] || [];
  messagesEl.innerHTML = '';
  msgs.forEach(m => {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (m.from === state.me.id? 'mine' : 'theirs');

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = m.text;

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';
    meta.textContent = fmtTime(m.timestamp);
    if (m.from === state.me.id) {
      const tick = document.createElement('span');
      tick.textContent = m.status === 'read'? '✓✓' : '✓';
      tick.className = m.status === 'read'? 'tick-read' : '';
      meta.appendChild(tick);
    }
    bubble.appendChild(meta);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---------- Sending messages / typing ----------

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text ||!state.activeContact) return;
  socket.emit('private_message', { toUserId: state.activeContact.id, text });
  socket.emit('stop_typing', { toUserId: state.activeContact.id });
  messageInput.value = '';
});

messageInput.addEventListener('input', () => {
  if (!state.activeContact) return;
  socket.emit('typing', { toUserId: state.activeContact.id });
  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(() => {
    socket.emit('stop_typing', { toUserId: state.activeContact.id });
  }, 1500);
});