# Chatty — a WhatsApp-style real-time chat app

A working real-time 1-to-1 chat app: Node.js/Express + Socket.io on the backend,
vanilla HTML/CSS/JS on the frontend. No build step needed.

## Features
- Sign up / log in (JWT-based auth, passwords hashed with bcrypt)
- Contact list with search
- Real-time messaging (Socket.io)
- Online/offline presence
- Typing indicators
- Read receipts (single tick = sent, double blue tick = read)
- Message history persisted to disk (JSON file store — see "Swapping in a real database" below)
- WhatsApp-style UI (green sent bubbles, teal header, contact list sidebar)

## Requirements
- Node.js 18+ 

## Setup

```bash
npm install
npm start
```

Then open **http://localhost:3000** in two different browser windows (or two
browsers / incognito tabs) to simulate two users chatting with each other.
Sign up as two different users, then click one contact from the other
account's contact list to start chatting.

For auto-restart during development:
```bash
npm run dev
```

## Project structure

```
whatsapp-clone/
├── server.js        # Express REST API + Socket.io real-time server
├── db.js            # Tiny JSON-file data store (users.json / messages.json)
├── package.json
├── public/
│   ├── index.html   # Auth screen + main app layout
│   ├── style.css    # WhatsApp-style theme
│   └── app.js        # Frontend logic: auth, contacts, socket events, rendering
└── data/            # Auto-created on first run — users.json & messages.json
```

## How it works

- **Auth**: `/api/register` and `/api/login` return a JWT. The frontend stores
  it in `localStorage` and sends it as a `Bearer` token on REST calls, and as
  `socket.handshake.auth.token` when opening the Socket.io connection.
- **Contacts**: `/api/users` (authenticated) returns every other registered user.
  In a real product this would be an actual contacts/friends list rather than
  "everyone who signed up."
- **Messaging**: the client emits a `private_message` event over the socket
  with `{ toUserId, text }`. The server persists it and emits `new_message` to
  both the sender's and recipient's socket rooms (`user:<id>`), so it's instant
  for the recipient and syncs across the sender's other open tabs/devices.
- **Presence**: the server tracks connected socket ids per user id in memory
  and broadcasts a `presence` event on connect/disconnect.
- **Typing & read receipts**: simple `typing` / `stop_typing` / `mark_read`
  socket events, mirroring how WhatsApp Web's real-time layer works.

## Swapping in a real database

`db.js` is intentionally the only file that touches storage, with a tiny
interface (`getUsers`, `saveUsers`, `getMessages`, `saveMessages`). To move to
Postgres, MySQL, MongoDB, etc., replace the internals of `db.js` with real
queries — `server.js` doesn't need to change.

## What this doesn't include (things real WhatsApp has that you may want to add)

- End-to-end encryption (WhatsApp uses the Signal protocol — this demo sends
  plaintext over your server, fine for learning/prototyping, not for production)
- Group chats
- Media/file/voice-note sharing
- Push notifications for closed tabs/apps
- Message delivery status for offline recipients beyond simple sent/read
- Horizontal scaling of Socket.io across multiple server instances (would need
  the Socket.io Redis adapter once you run more than one server process)

## License
Do whatever you want with this — it's yours.
