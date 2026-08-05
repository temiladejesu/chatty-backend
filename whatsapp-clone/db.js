// db.js
// Lightweight file-based JSON data store.
// Swap this out for Postgres/MongoDB/etc. in production — the interface
// (getUsers, saveUsers, getMessages, saveMessages) is intentionally tiny.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

function ensureFile(file, fallback) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
}

ensureFile(USERS_FILE, []);
ensureFile(MESSAGES_FILE, []);

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {
  getUsers: () => readJSON(USERS_FILE),
  saveUsers: (users) => writeJSON(USERS_FILE, users),
  getMessages: () => readJSON(MESSAGES_FILE),
  saveMessages: (messages) => writeJSON(MESSAGES_FILE, messages),
};
