const path = require('path');
const { io } = require(path.join(__dirname, '..', '..', '..', 'node_modules', 'socket.io-client'));

const FRONTEND_URL = process.env.QA_FRONTEND_URL || 'http://127.0.0.1:8080';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeUser(prefix) {
  const seed = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    username: (prefix + seed).slice(0, 12),
    password: 'Passw0rd1234'
  };
}

class SocketTestClient {
  constructor(label) {
    this.label = label;
    this.socket = null;
    this.latestState = null;
    this.messages = [];
    this.errors = [];
    this.prompts = [];
  }

  async connect() {
    this.socket = io(FRONTEND_URL, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });
    this.socket.on('state', data => {
      this.latestState = data;
    });
    this.socket.on('chat', message => {
      this.messages.push(message);
    });
    this.socket.on('prompts', prompts => {
      this.prompts = prompts;
    });
    ['room_error', 'fail', 'login_fail', 'reg_fail'].forEach(event => {
      this.socket.on(event, payload => {
        this.errors.push({ event, payload });
      });
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(this.label + ' connect timeout')), 5000);
      this.socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.on('connect_error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  once(event, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(this.label + ' timeout waiting for ' + event)), timeout);
      this.socket.once(event, payload => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  async waitFor(predicate, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = predicate();
      if (value) {
        return value;
      }
      await delay(25);
    }
    throw new Error(this.label + ' waitFor timeout');
  }

  emit(event, payload) {
    this.socket.emit(event, payload);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

async function registerClient(client, user) {
  client.emit('register', user);
  await client.once('reg_success');
  return user;
}

async function loginClient(client, user) {
  client.emit('login', user);
  await client.once('login_success');
  return user;
}

async function createRoomForClient(client) {
  client.emit('room/create');
  return client.once('room_created');
}

async function joinRoomForClient(client, roomCode) {
  client.emit('room/select', { roomCode });
  return client.once('room_selected');
}

function disconnectAll(clients) {
  clients.forEach(client => client.disconnect());
}

module.exports = {
  SocketTestClient,
  delay,
  makeUser,
  registerClient,
  loginClient,
  createRoomForClient,
  joinRoomForClient,
  disconnectAll
};
