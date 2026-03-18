'use strict';

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.Server(app);
const io = socketIo(server);

const AUTO_SHUTDOWN_IF_IDLE = process.env.AUTO_SHUTDOWN_IF_IDLE === '1';
const JOIN_URL = process.env.JOIN_URL || null;
const BACKEND_ENDPOINT = process.env.BACKEND || 'http://localhost:8181';
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;
const RECONNECT_GRACE_MS = 15000;
const MAX_CHAT_LENGTH = 220;
const MAX_ANSWER_LENGTH = 120;
const BLOCKED_TERMS = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'slut', 'whore'];

const connectedSockets = new Set();
const socketSessions = new Map();
const rooms = new Map();
let idleShutdownTimer = null;

if (process.env.NODE_ENV === 'production' && (!process.env.BACKEND || process.env.BACKEND.includes('localhost'))) {
  throw new Error('BACKEND must be set to the deployed backend URL in production.');
}

function createInitialState() {
  return {
    state: 0,
    round: 0,
    promptPlayers: {},
    pastPrompts: [],
    answers: {},
    playerAnswers: {},
    votes: {},
    currentPrompt: null,
    roundScores: {},
    totalScores: {}
  };
}

function createRoom(code) {
  const room = {
    code,
    players: new Map(),
    playersToSockets: new Map(),
    socketsToPlayers: new Map(),
    audience: new Map(),
    audienceToSockets: new Map(),
    socketsToAudience: new Map(),
    nextPlayerNumber: 0,
    nextAudienceNumber: 0,
    suggestedPrompts: new Map(),
    playerPrompts: new Map(),
    disconnectedPlayers: new Map(),
    state: createInitialState()
  };

  rooms.set(code, room);
  return room;
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function generateRoomCode() {
  let code = '';

  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const index = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
      code += ROOM_CODE_CHARS[index];
    }
  } while (rooms.has(code));

  return code;
}

function getRoom(roomCode) {
  return rooms.get(normalizeRoomCode(roomCode)) || null;
}

function getSocketSession(socket) {
  return socketSessions.get(socket.id) || null;
}

function getRoomForSocket(socket) {
  const session = getSocketSession(socket);
  if (!session) {
    return null;
  }

  return rooms.get(session.roomCode) || null;
}

function setPendingRoomSelection(socket, roomCode) {
  const code = normalizeRoomCode(roomCode);
  const previousSession = getSocketSession(socket);

  if (previousSession && previousSession.roomCode && previousSession.roomCode !== code) {
    socket.leave(previousSession.roomCode);
  }

  socket.join(code);
  socketSessions.set(socket.id, {
    roomCode: code,
    joined: false,
    role: null,
    participantId: null,
    authenticated: previousSession ? previousSession.authenticated === true : false,
    username: previousSession ? previousSession.username || '' : '',
    displayName: previousSession ? previousSession.displayName || '' : '',
    isDisplay: previousSession ? previousSession.isDisplay === true : false
  });

  if (previousSession && previousSession.roomCode && previousSession.roomCode !== code) {
    cleanupRoomIfEmpty(previousSession.roomCode);
  }
}

function setJoinedRoomSession(socket, room, role, participantId) {
  const previousSession = getSocketSession(socket);
  socket.join(room.code);
  socketSessions.set(socket.id, {
    roomCode: room.code,
    joined: true,
    role,
    participantId,
    authenticated: previousSession ? previousSession.authenticated === true : false,
    username: previousSession ? previousSession.username || '' : '',
    displayName: previousSession ? previousSession.displayName || '' : '',
    isDisplay: false
  });
}

function setAuthenticatedSession(socket, username) {
  const previousSession = getSocketSession(socket);
  socketSessions.set(socket.id, {
    roomCode: previousSession ? previousSession.roomCode || null : null,
    joined: previousSession ? previousSession.joined === true : false,
    role: previousSession ? previousSession.role || null : null,
    participantId: previousSession ? previousSession.participantId || null : null,
    authenticated: true,
    username,
    displayName: previousSession ? previousSession.displayName || '' : '',
    isDisplay: previousSession ? previousSession.isDisplay === true : false
  });
}

function clearJoinedSession(socket) {
  const previousSession = getSocketSession(socket);
  if (!previousSession) {
    return;
  }

  if (previousSession.roomCode) {
    socket.leave(previousSession.roomCode);
  }

  socketSessions.set(socket.id, {
    roomCode: null,
    joined: false,
    role: null,
    participantId: null,
    authenticated: previousSession.authenticated === true,
    username: previousSession.username || '',
    displayName: previousSession.displayName || '',
    isDisplay: false
  });
}

function setDisplaySession(socket, roomCode) {
  const code = normalizeRoomCode(roomCode);
  const previousSession = getSocketSession(socket);

  if (previousSession && previousSession.roomCode && previousSession.roomCode !== code) {
    socket.leave(previousSession.roomCode);
  }

  socket.join(code);
  socketSessions.set(socket.id, {
    roomCode: code,
    joined: false,
    role: null,
    participantId: null,
    authenticated: false,
    username: '',
    displayName: 'display',
    isDisplay: true
  });

  if (previousSession && previousSession.roomCode && previousSession.roomCode !== code) {
    cleanupRoomIfEmpty(previousSession.roomCode);
  }
}

function removeSocketSession(socket) {
  const session = getSocketSession(socket);
  if (!session) {
    return null;
  }

  socketSessions.delete(socket.id);
  return session;
}

function cleanupRoomIfEmpty(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  if (room.players.size > 0 || room.audience.size > 0 || room.disconnectedPlayers.size > 0) {
    return;
  }

  for (const session of socketSessions.values()) {
    if (session.roomCode === roomCode) {
      return;
    }
  }

  rooms.delete(roomCode);
  console.log('Deleted empty room ' + roomCode);
}

function normalizeTextInput(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function containsBlockedTerm(text) {
  const normalized = normalizeTextInput(text).toLowerCase();
  return BLOCKED_TERMS.some(term => normalized.includes(term));
}

function validateChatMessage(text) {
  const normalized = normalizeTextInput(text);
  if (!normalized) {
    return { ok: false, message: 'Chat messages cannot be empty.' };
  }
  if (normalized.length > MAX_CHAT_LENGTH) {
    return { ok: false, message: 'Chat messages must be 220 characters or fewer.' };
  }
  if (containsBlockedTerm(normalized)) {
    return { ok: false, message: 'Chat message blocked by moderation filter.' };
  }
  return { ok: true, value: normalized };
}

function validatePromptSubmission(text) {
  const normalized = normalizeTextInput(text);
  if (normalized.length < 15 || normalized.length > 80) {
    return { ok: false, message: 'Each prompt must be between 15 and 80 characters.' };
  }
  if (containsBlockedTerm(normalized)) {
    return { ok: false, message: 'Prompt blocked by moderation filter.' };
  }
  return { ok: true, value: normalized };
}

function validateAnswerSubmission(text) {
  const normalized = normalizeTextInput(text);
  if (!normalized) {
    return { ok: false, message: 'Answers cannot be empty.' };
  }
  if (normalized.length > MAX_ANSWER_LENGTH) {
    return { ok: false, message: 'Answers must be 120 characters or fewer.' };
  }
  if (containsBlockedTerm(normalized)) {
    return { ok: false, message: 'Answer blocked by moderation filter.' };
  }
  return { ok: true, value: normalized };
}

function setRoomLoading(room, active, message) {
  io.to(room.code).emit('loading', {
    active,
    message: active ? message : ''
  });
}

function findPlayerEntryByName(room, username) {
  for (const [playerNumber, player] of room.players.entries()) {
    if (player.name === username) {
      return { playerNumber, player };
    }
  }
  return null;
}

function clearDisconnectedReservation(room, username) {
  const reservation = room.disconnectedPlayers.get(username);
  if (!reservation) {
    return null;
  }

  clearTimeout(reservation.timer);
  room.disconnectedPlayers.delete(username);
  return reservation;
}

function restoreDisconnectedPlayer(room, socket, username) {
  const reservation = clearDisconnectedReservation(room, username);
  if (!reservation) {
    return false;
  }

  const player = room.players.get(reservation.playerNumber);
  if (!player) {
    return false;
  }

  player.connected = true;
  room.playersToSockets.set(reservation.playerNumber, socket);
  room.socketsToPlayers.set(socket, reservation.playerNumber);
  setJoinedRoomSession(socket, room, 'player', reservation.playerNumber);
  announce(room, username + ' reconnected.');
  updateAll(room);
  return true;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('client', {
    joinUrl: JOIN_URL || `${req.protocol}://${req.get('host')}`,
    initialRoomCode: normalizeRoomCode(req.query.room || '')
  });
});

app.get('/display', (req, res) => {
  res.render('display', {
    initialRoomCode: normalizeRoomCode(req.query.room || '')
  });
});

function startServer() {
  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

function cancelIdleShutdown() {
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
}

function scheduleIdleShutdownIfNeeded() {
  if (!AUTO_SHUTDOWN_IF_IDLE) {
    return;
  }

  if (connectedSockets.size > 0 || socketSessions.size > 0) {
    return;
  }

  cancelIdleShutdown();
  idleShutdownTimer = setTimeout(() => {
    if (connectedSockets.size === 0 && socketSessions.size === 0) {
      console.log('No connected tabs and no joined users remain. Shutting down.');
      process.exit(0);
    }
  }, 2500);
}

async function checkBackendWarm(socket) {
  let warmingNotified = false;
  const warmingTimeout = setTimeout(() => {
    warmingNotified = true;
    socket.emit('backend_status', { warming: true });
  }, 1500);

  try {
    await axios.get(BACKEND_ENDPOINT + '/health', { timeout: 40000 });
  } catch (_) {
    // backend unreachable — still clear the banner so the user gets the error on login
  }

  clearTimeout(warmingTimeout);
  if (warmingNotified) {
    socket.emit('backend_status', { warming: false });
  }
}

async function callAzureFunction(endpoint, method, data) {
  try {
    const config = {
      method,
      url: endpoint
    };

    if (data !== '') {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error('Error calling Azure Function:', error.message);
    throw error;
  }
}

function error(socket, message, halt) {
  console.log('Error: ' + message);
  socket.emit('fail', message);
  if (halt) {
    socket.disconnect();
  }
}

function buildStatePayload(room, me) {
  return {
    roomCode: room.code,
    state: room.state,
    me,
    players: Object.fromEntries(room.players),
    audience: Object.fromEntries(room.audience),
    suggestedPrompts: Object.fromEntries(room.suggestedPrompts)
  };
}

function buildPublicState(room) {
  return {
    roomCode: room.code,
    state: room.state,
    players: Object.fromEntries(room.players),
    audience: Object.fromEntries(room.audience)
  };
}

function broadcastPublicState(room) {
  io.to(room.code).emit('public_state', buildPublicState(room));
}

function updatePlayer(room, socket) {
  const playerNumber = room.socketsToPlayers.get(socket);
  const player = room.players.get(playerNumber);
  socket.emit('state', buildStatePayload(room, player));
}

function updateAudienceMember(room, socket) {
  const audienceNumber = room.socketsToAudience.get(socket);
  const audienceMember = room.audience.get(audienceNumber);
  socket.emit('state', buildStatePayload(room, audienceMember));
}

function updateAll(room) {
  console.log('Updating room ' + room.code);

  for (const [, socket] of room.playersToSockets) {
    updatePlayer(room, socket);
  }

  for (const [, socket] of room.audienceToSockets) {
    updateAudienceMember(room, socket);
  }

  broadcastPublicState(room);
}

function buildChatPayload(senderName, senderType, message) {
  return {
    sender: senderName,
    senderType,
    text: message,
    avatarSeed: senderName
  };
}

function announce(room, message) {
  console.log('Room ' + room.code + ' announcement: ' + message);
  io.to(room.code).emit('chat', buildChatPayload('System', 'system', message));
}

function announcePlayerJoined(room, username, isAdmin) {
  if (isAdmin) {
    announce(room, username + ' joined the lobby as admin.');
    return;
  }

  announce(room, username + ' joined the lobby.');
}

function announceAudienceJoined(room, username) {
  announce(room, username + ' joined as audience.');
}

function handleChat(room, socket, message) {
  const validation = validateChatMessage(message);
  if (!validation.ok) {
    socket.emit('fail', validation.message);
    return;
  }

  let senderName = 'Unknown';
  let senderType = 'player';

  if (room.socketsToPlayers.has(socket)) {
    const playerNumber = room.socketsToPlayers.get(socket);
    const player = room.players.get(playerNumber);
    senderName = player ? player.name : 'Player ' + playerNumber;
    senderType = 'player';
  } else if (room.socketsToAudience.has(socket)) {
    const audienceNumber = room.socketsToAudience.get(socket);
    const audienceMember = room.audience.get(audienceNumber);
    senderName = audienceMember ? audienceMember.name : 'Audience ' + audienceNumber;
    senderType = 'audience';
  } else {
    return;
  }

  io.to(room.code).emit('chat', buildChatPayload(senderName, senderType, validation.value));
}

function handleJoin(room, socket, username) {
  console.log('Handling join for room ' + room.code);
  cancelIdleShutdown();

  if (restoreDisconnectedPlayer(room, socket, username)) {
    return true;
  }

  const existingPlayerEntry = findPlayerEntryByName(room, username);
  if (existingPlayerEntry) {
    socket.emit('room_error', 'You are already connected to this room.');
    return false;
  }

  if (room.state.state > 0) {
    room.nextAudienceNumber++;
    announceAudienceJoined(room, username);

    room.audience.set(room.nextAudienceNumber, {
      name: username,
      audience: true,
      connected: true
    });
    room.audienceToSockets.set(room.nextAudienceNumber, socket);
    room.socketsToAudience.set(socket, room.nextAudienceNumber);
    setJoinedRoomSession(socket, room, 'audience', room.nextAudienceNumber);
    return true;
  }

  if (room.players.size < 8) {
    const shouldBeHost = room.players.size === 0 || !Array.from(room.players.values()).some(player => player.admin);

    room.nextPlayerNumber++;
    announcePlayerJoined(room, username, shouldBeHost);

    room.players.set(room.nextPlayerNumber, {
      name: username,
      admin: shouldBeHost,
      connected: true,
      state: 1,
      roundPrompts: [],
      roundAnswers: {},
      currentVotes: [],
      roundScore: 0,
      totalScore: 0
    });
    room.playersToSockets.set(room.nextPlayerNumber, socket);
    room.socketsToPlayers.set(socket, room.nextPlayerNumber);
    setJoinedRoomSession(socket, room, 'player', room.nextPlayerNumber);
    return true;
  }

  room.nextAudienceNumber++;
  announceAudienceJoined(room, username);
  room.audience.set(room.nextAudienceNumber, {
    name: username,
    audience: true,
    connected: true
  });
  room.audienceToSockets.set(room.nextAudienceNumber, socket);
  room.socketsToAudience.set(socket, room.nextAudienceNumber);
  setJoinedRoomSession(socket, room, 'audience', room.nextAudienceNumber);
  return true;
}

function resetRoomToLobby(room) {
  room.state = createInitialState();
  room.suggestedPrompts.clear();
  room.playerPrompts = new Map();
  for (const [, audienceSocket] of room.audienceToSockets) {
    audienceSocket.emit('audience_reset', {
      message: 'The game has ended. Join or start a room to play again.'
    });
    clearJoinedSession(audienceSocket);
  }
  room.audience.clear();
  room.audienceToSockets.clear();
  room.socketsToAudience.clear();

  for (const [, player] of room.players) {
    player.connected = true;
    player.state = 1;
    player.roundPrompts = [];
    player.roundAnswers = {};
    player.currentVotes = [];
    player.roundScore = 0;
    player.totalScore = 0;
  }
}

function assignAdminIfNeeded(room) {
  let hasAdmin = false;

  for (const [, player] of room.players) {
    if (player.admin) {
      hasAdmin = true;
      break;
    }
  }

  if (hasAdmin || room.players.size === 0) {
    return;
  }

  const nextAdminEntry = room.players.entries().next().value;
  if (!nextAdminEntry) {
    return;
  }

  const [, player] = nextAdminEntry;
  player.admin = true;
  announce(room, player.name + ' is now the admin and can control the game.');
}

function completedRoundsSoFar(room) {
  if (room.state.state >= 4) {
    return room.state.round;
  }

  return Math.max(room.state.round - 1, 0);
}

function commitRoundScoresToTotals(room) {
  if (room.state.state !== 4) {
    return;
  }

  for (const [playerNumber, player] of room.players) {
    player.totalScore += player.roundScore;
    if (playerNumber in room.state.roundScores) {
      if (playerNumber in room.state.totalScores) {
        room.state.totalScores[playerNumber] += room.state.roundScores[playerNumber];
      } else {
        room.state.totalScores[playerNumber] = room.state.roundScores[playerNumber];
      }
    }
  }
}

function endGameEarlyAfterDisconnect(room) {
  commitRoundScoresToTotals(room);
  room.state.state = 5;
  room.state.currentPrompt = null;
  startGameOver(room);
}

function handleAdmin(room, playerNumber, action) {
  const player = room.players.get(playerNumber);
  if (!player || player.admin === false) {
    console.log('Failed admin action from player ' + playerNumber + ' for ' + action);
    return;
  }

  if (action === 'start' && room.state.state === 0) {
    console.log('Starting game in room ' + room.code);
    advanceGameState(room);
    return;
  }

  if (action === 'returnToLobby' && room.state.state === 5) {
    announce(room, 'Returning to the lobby.');
    resetRoomToLobby(room);
    updateAll(room);
  }
}

async function handleLogin(socket, data) {
  const player = {
    username: data.username,
    password: data.password
  };

  console.log('Logging in player ' + player.username);

  try {
    const response = await callAzureFunction(BACKEND_ENDPOINT + '/player/login', 'post', player);
    socket.emit('loading', { active: false, message: '' });
    if (response.result === true) {
      setAuthenticatedSession(socket, player.username);
      socket.emit('login_success', { username: player.username });
      return;
    }

    socket.emit('login_fail', response.msg);
  } catch (err) {
    console.log('Error calling azure function: ' + err);
    socket.emit('loading', { active: false, message: '' });
    socket.emit('login_fail', 'Login service is unavailable. Start the backend on port 8181 and try again.');
  }
}

async function handleRegister(socket, data) {
  const player = {
    username: data.username,
    password: data.password
  };

  console.log('Registering player ' + player.username);

  try {
    const response = await callAzureFunction(BACKEND_ENDPOINT + '/player/register', 'post', player);
    socket.emit('loading', { active: false, message: '' });
    if (response.result === true) {
      setAuthenticatedSession(socket, player.username);
      socket.emit('reg_success', { username: player.username });
      return;
    }

    socket.emit('reg_fail', response.msg);
  } catch (err) {
    console.log('Error calling azure function: ' + err);
    socket.emit('loading', { active: false, message: '' });
    socket.emit('reg_fail', 'Registration service is unavailable. Start the backend on port 8181 and try again.');
  }
}

async function handlePrompt(room, playerNumber, data) {
  const validation = validatePromptSubmission(data.prompt);
  if (!validation.ok) {
    const socket = room.playersToSockets.get(playerNumber);
    if (socket) {
      socket.emit('fail', validation.message);
    }
    return;
  }

  room.suggestedPrompts.set(playerNumber, validation.value);
  room.players.get(playerNumber).state = 2;
  updateAll(room);
}

function handleAnswer(room, socket, data) {
  const playerNumber = room.socketsToPlayers.get(socket);
  if (!playerNumber) {
    return;
  }

  const player = room.players.get(playerNumber);
  if (!player) {
    return;
  }

  try {
    Object.entries(data).forEach(([promptText, answerText]) => {
      const validation = validateAnswerSubmission(answerText);
      if (!validation.ok) {
        throw new Error(validation.message);
      }
    });
  } catch (validationError) {
    socket.emit('fail', validationError.message);
    return;
  }

  Object.entries(data).forEach(([promptText, answerText]) => {
    const validation = validateAnswerSubmission(answerText);
    player.roundAnswers[promptText] = validation.value;
    if (playerNumber in room.state.playerAnswers) {
      room.state.playerAnswers[playerNumber].push(validation.value);
    } else {
      room.state.playerAnswers[playerNumber] = [validation.value];
    }

    const promptsForPlayer = room.playerPrompts.get(playerNumber) || [];
    if (!promptsForPlayer.includes(promptText)) {
      return;
    }

    if (!(promptText in room.state.answers)) {
      room.state.answers[promptText] = [];
    }

    room.state.answers[promptText].push(validation.value);
  });

  player.state++;
  updateAll(room);
}

function handleVote(room, socket, answer) {
  const playerNumber = room.socketsToPlayers.get(socket);
  if (!playerNumber) {
    return;
  }

  const player = room.players.get(playerNumber);
  if (!player) {
    return;
  }

  player.currentVotes.push(answer);
  if (!(answer in room.state.votes)) {
    room.state.votes[answer] = [playerNumber];
  } else {
    room.state.votes[answer].push(playerNumber);
  }

  player.state = 6;
  updateAll(room);
}

function handleNext(room) {
  advanceGameState(room);
}

function finalizePlayerDisconnect(room, playerNumber) {
  const player = room.players.get(playerNumber);
  if (!player) {
    return;
  }

  const playerName = player.name;
  const wasAdmin = player.admin;

  room.players.delete(playerNumber);
  room.suggestedPrompts.delete(playerNumber);
  room.playerPrompts.delete(playerNumber);
  delete room.state.playerAnswers[playerNumber];
  delete room.state.roundScores[playerNumber];
  delete room.state.totalScores[playerNumber];

  for (const prompt of Object.keys(room.state.promptPlayers)) {
    room.state.promptPlayers[prompt] = room.state.promptPlayers[prompt].filter(id => id !== playerNumber);
    if (room.state.promptPlayers[prompt].length === 0) {
      delete room.state.promptPlayers[prompt];
      delete room.state.answers[prompt];
      if (room.state.currentPrompt === prompt) {
        room.state.currentPrompt = Object.keys(room.state.promptPlayers)[0] || null;
      }
    }
  }

  for (const answer of Object.keys(room.state.votes)) {
    room.state.votes[answer] = room.state.votes[answer].filter(voterId => voterId !== playerNumber);
    if (room.state.votes[answer].length === 0) {
      delete room.state.votes[answer];
    }
  }

  if (wasAdmin) {
    assignAdminIfNeeded(room);
  }

  announce(room, playerName + ' disconnected.');

  if (room.state.state === 0) {
    announce(room, 'Waiting for another player to join. ' + room.players.size + ' player(s) currently connected.');
    updateAll(room);
    return;
  }

  if (completedRoundsSoFar(room) > 0) {
    announce(room, 'The game is ending early because ' + playerName + ' disconnected. Showing scores so far.');
    endGameEarlyAfterDisconnect(room);
  } else {
    announce(room, playerName + ' disconnected before the first round finished. Returning to the lobby.');
    resetRoomToLobby(room);
  }

  updateAll(room);
}

function handlePlayerDisconnect(room, socket, session) {
  const playerNumber = room.socketsToPlayers.get(socket);
  const player = room.players.get(playerNumber);

  room.socketsToPlayers.delete(socket);
  room.playersToSockets.delete(playerNumber);

  if (!player) {
    return;
  }

  player.connected = false;

  if (!session || !session.username) {
    finalizePlayerDisconnect(room, playerNumber);
    return;
  }

  const username = session.username;
  clearDisconnectedReservation(room, username);
  const timer = setTimeout(() => {
    room.disconnectedPlayers.delete(username);
    finalizePlayerDisconnect(room, playerNumber);
    cleanupRoomIfEmpty(room.code);
  }, RECONNECT_GRACE_MS);

  room.disconnectedPlayers.set(username, {
    playerNumber,
    timer,
    disconnectedAt: Date.now()
  });

  announce(room, username + ' disconnected. Waiting ' + Math.floor(RECONNECT_GRACE_MS / 1000) + ' seconds for them to reconnect.');
  updateAll(room);
}

function handleAudienceDisconnect(room, socket) {
  const audienceNumber = room.socketsToAudience.get(socket);
  const audienceMember = room.audience.get(audienceNumber);

  room.socketsToAudience.delete(socket);
  room.audienceToSockets.delete(audienceNumber);

  if (!audienceMember) {
    return;
  }

  room.audience.delete(audienceNumber);
  announce(room, audienceMember.name + ' left the audience.');
  updateAll(room);
  cleanupRoomIfEmpty(room.code);
}

function startGame(room) {
  announce(room, 'Let the games begin');
}

function startPrompts(room) {
  room.state.round++;
  room.state.answers = {};
  room.state.playerAnswers = {};
  room.state.promptPlayers = {};
  room.state.votes = {};
  room.state.currentPrompt = null;
  room.suggestedPrompts.clear();
  room.state.roundScores = {};

  for (const [, player] of room.players) {
    player.roundPrompts = [];
    player.roundAnswers = {};
    player.currentVotes = [];
    player.roundScore = 0;
  }
}

async function endPrompts(room) {
  for (const [playerNumber, prompt] of room.suggestedPrompts) {
    const payload = {
      username: room.players.get(playerNumber).name,
      text: prompt
    };

    const response = await callAzureFunction(BACKEND_ENDPOINT + '/prompt/create', 'post', payload);
    if (response.result !== true) {
      throw new Error('Prompt submission failed for player ' + playerNumber);
    }
  }
}

function startVotes() {
  console.log('Starting voting');
}

function endVotes(room) {
  for (const [playerNumber] of room.playerPrompts) {
    room.players.get(playerNumber).state = 7;
  }
}

function calculatePromptNumbers(playerCount) {
  return playerCount % 2 === 0 ? (playerCount / 2) : playerCount;
}

function selectUniquePrompts(promptsArray, numPromptsNeeded) {
  const selectedPrompts = new Set();
  const promptsCopy = [...promptsArray];

  while (selectedPrompts.size < numPromptsNeeded && promptsCopy.length > 0) {
    const randomIndex = Math.floor(Math.random() * promptsCopy.length);
    const selectedPrompt = promptsCopy[randomIndex];
    selectedPrompts.add(selectedPrompt);
    promptsCopy.splice(randomIndex, 1);
  }

  return Array.from(selectedPrompts);
}

function selectPrompts(totalPromptsNeeded, suggestedPrompts, apiPrompts) {
  const halfTotalPrompts = Math.ceil(totalPromptsNeeded / 2);
  const selectedApiPrompts = selectUniquePrompts(apiPrompts, halfTotalPrompts);
  const apiShortfall = halfTotalPrompts - selectedApiPrompts.length;
  const localPromptsNeeded = (totalPromptsNeeded - halfTotalPrompts) + apiShortfall;
  const selectedLocalPrompts = selectUniquePrompts(suggestedPrompts, localPromptsNeeded);
  return Array.from(new Set([...selectedApiPrompts, ...selectedLocalPrompts]));
}

function assignPromptsToPlayers(players, prompts) {
  const mappedPrompts = new Map();
  const playerIds = [...players.keys()];

  if (playerIds.length % 2 === 0) {
    for (let i = 0; i < playerIds.length; i += 2) {
      const prompt = prompts[i / 2];
      mappedPrompts.set(playerIds[i], [prompt]);
      mappedPrompts.set(playerIds[i + 1], [prompt]);
    }
    return mappedPrompts;
  }

  for (let i = 0; i < playerIds.length; i++) {
    const prompt1 = prompts[i % prompts.length];
    const prompt2 = prompts[(i + 1) % prompts.length];
    mappedPrompts.set(playerIds[i], [prompt1, prompt2]);
  }

  return mappedPrompts;
}

async function startAnswers(room) {
  const numPrompts = calculatePromptNumbers(room.players.size);
  const playerList = [];
  const apiPrompts = [];

  for (const [, player] of room.players) {
    playerList.push(player.name);
  }
  for (const [, audienceMember] of room.audience) {
    playerList.push(audienceMember.name);
  }

  const input = {
    players: playerList,
    language: 'en'
  };

  const response = await callAzureFunction(BACKEND_ENDPOINT + '/utils/get', 'get', input);
  for (const prompt of response) {
    if (!apiPrompts.includes(prompt.text)) {
      apiPrompts.push(prompt.text);
    }
  }

  for (const [, prompt] of room.suggestedPrompts) {
    const index = apiPrompts.indexOf(prompt);
    if (index !== -1) {
      apiPrompts.splice(index, 1);
    }
  }

  const selectedPrompts = selectPrompts(numPrompts, Array.from(room.suggestedPrompts.values()), apiPrompts);
  room.playerPrompts = assignPromptsToPlayers(room.players, selectedPrompts);

  for (const [playerNumber, prompts] of room.playerPrompts) {
    room.players.get(playerNumber).roundPrompts = prompts;
    room.playersToSockets.get(playerNumber).emit('prompts', prompts);

    for (const prompt of prompts) {
      if (prompt in room.state.promptPlayers) {
        room.state.promptPlayers[prompt].push(playerNumber);
      } else {
        room.state.promptPlayers[prompt] = [playerNumber];
      }
    }

    room.players.get(playerNumber).state = 3;
  }
}

function endAnswers(room) {
  for (const [playerNumber] of room.playerPrompts) {
    room.players.get(playerNumber).state++;
  }

  for (const [playerNumber] of room.players) {
    room.state.roundScores[playerNumber] = 0;
  }

  room.state.currentPrompt = Object.keys(room.state.promptPlayers)[0] || null;
  updateAll(room);
}

function startResults() {
  console.log('Starting results');
}

function endResults() {
  console.log('Ending results');
}

function startGameOver(room) {
  console.log('Starting game over for room ' + room.code);
}

function endGameOver(room) {
  console.log('Ending game over for room ' + room.code);
}

function checkGameOver(room) {
  return room.state.round >= 3;
}

async function advanceGameState(room) {
  switch (room.state.state) {
    case 0:
      startGame(room);
      room.state.state = 1;
      startPrompts(room);
      break;
    case 1:
      setRoomLoading(room, true, 'Preparing prompts and answers. This can take a moment if the backend is cold.');
      try {
        await endPrompts(room);
      } catch (err) {
        console.log('Error during endPrompts:', err.message);
        setRoomLoading(room, false, '');
        io.to(room.code).emit('error', { message: 'Failed to submit prompts. Each prompt must be between 15 and 80 characters.' });
        return;
      }
      room.state.state = 2;
      try {
        await startAnswers(room);
      } catch (err) {
        console.log('Error during startAnswers:', err.message);
        setRoomLoading(room, false, '');
        io.to(room.code).emit('error', { message: 'Failed to start answers phase.' });
        return;
      }
      setRoomLoading(room, false, '');
      break;
    case 2:
      endAnswers(room);
      room.state.state = 3;
      startVotes(room);
      break;
    case 3:
      endVotes(room);
      room.state.state = 4;
      startResults(room);
      break;
    case 4:
      endResults(room);
      if (checkGameOver(room)) {
        room.state.state = 5;
        for (const [playerNumber, player] of room.players) {
          player.totalScore += player.roundScore;
        }
        for (const [playerNumber, score] of Object.entries(room.state.roundScores)) {
          if (playerNumber in room.state.totalScores) {
            room.state.totalScores[playerNumber] += score;
          } else {
            room.state.totalScores[playerNumber] = score;
          }
        }
        startGameOver(room);
      } else {
        room.state.state = 1;
        for (const [playerNumber, player] of room.players) {
          player.state = 1;
          player.totalScore += player.roundScore;
        }
        for (const [playerNumber, score] of Object.entries(room.state.roundScores)) {
          if (playerNumber in room.state.totalScores) {
            room.state.totalScores[playerNumber] += score;
          } else {
            room.state.totalScores[playerNumber] = score;
          }
        }
        startPrompts(room);
      }
      break;
    case 5:
      endGameOver(room);
      break;
    default:
      break;
  }

  updateAll(room);
}

function findAnswerSubmitter(room, currentPrompt, answerText) {
  const playersForPrompt = room.state.promptPlayers[currentPrompt] || [];
  return playersForPrompt.find(playerNumber => {
    const answers = room.state.playerAnswers[playerNumber] || [];
    return answers.includes(answerText);
  });
}

io.on('connection', socket => {
  console.log('New connection');
  connectedSockets.add(socket.id);
  cancelIdleShutdown();
  checkBackendWarm(socket);

  socket.on('room/create', () => {
    const existingSession = getSocketSession(socket);
    if (!existingSession || existingSession.authenticated !== true || !existingSession.username) {
      socket.emit('room_error', 'Log in before creating a room.');
      return;
    }

    if (existingSession.joined) {
      socket.emit('room_error', 'You are already in a room.');
      return;
    }

    const roomCode = generateRoomCode();
    const room = createRoom(roomCode);
    setPendingRoomSelection(socket, roomCode);
    if (!handleJoin(room, socket, existingSession.username)) {
      return;
    }
    updateAll(room);
    socket.emit('room_created', { roomCode, username: existingSession.username });
  });

  socket.on('room/select', data => {
    const existingSession = getSocketSession(socket);
    if (!existingSession || existingSession.authenticated !== true || !existingSession.username) {
      socket.emit('room_error', 'Log in before joining a room.');
      return;
    }

    if (existingSession.joined) {
      socket.emit('room_error', 'You are already in a room.');
      return;
    }

    const roomCode = normalizeRoomCode(data && data.roomCode);
    const room = getRoom(roomCode);
    if (!room) {
      socket.emit('room_error', 'That room code does not exist.');
      return;
    }

    setPendingRoomSelection(socket, room.code);
    if (!handleJoin(room, socket, existingSession.username)) {
      return;
    }
    updateAll(room);
    socket.emit('room_selected', { roomCode: room.code, username: existingSession.username });
  });

  socket.on('display/select', data => {
    const roomCode = normalizeRoomCode(data && data.roomCode);
    const room = getRoom(roomCode);
    if (!room) {
      socket.emit('display_error', 'That room code does not exist.');
      return;
    }

    setDisplaySession(socket, room.code);
    socket.emit('display_selected', { roomCode: room.code });
    socket.emit('public_state', buildPublicState(room));
  });

  socket.on('chat', message => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }

    if (room.socketsToPlayers.has(socket) || room.socketsToAudience.has(socket)) {
      handleChat(room, socket, message);
    }
  });

  socket.on('disconnect', () => {
    console.log('Dropped connection');
    connectedSockets.delete(socket.id);

    const session = getSocketSession(socket);
    const room = session ? rooms.get(session.roomCode) : null;

    if (room && session && session.joined) {
      if (session.role === 'player' && room.socketsToPlayers.has(socket)) {
        handlePlayerDisconnect(room, socket, session);
      } else if (session.role === 'audience' && room.socketsToAudience.has(socket)) {
        handleAudienceDisconnect(room, socket);
      }
    }

    const removedSession = removeSocketSession(socket);
    if (removedSession) {
      cleanupRoomIfEmpty(removedSession.roomCode);
    }

    scheduleIdleShutdownIfNeeded();
  });

  socket.on('login', data => {
    const session = getSocketSession(socket);
    if (session && session.joined) {
      return;
    }

    socket.emit('loading', {
      active: true,
      message: 'Signing in and waking the backend if needed...'
    });

    handleLogin(socket, data);
  });

  socket.on('register', data => {
    const session = getSocketSession(socket);
    if (session && session.joined) {
      return;
    }

    socket.emit('loading', {
      active: true,
      message: 'Creating your account and waking the backend if needed...'
    });

    handleRegister(socket, data);
  });

  socket.on('admin', action => {
    const room = getRoomForSocket(socket);
    if (!room || !room.socketsToPlayers.has(socket)) {
      return;
    }

    handleAdmin(room, room.socketsToPlayers.get(socket), action);
  });

  socket.on('prompt', data => {
    const room = getRoomForSocket(socket);
    if (!room || !room.socketsToPlayers.has(socket)) {
      return;
    }

    handlePrompt(room, room.socketsToPlayers.get(socket), data);
  });

  socket.on('answer', data => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }

    handleAnswer(room, socket, data);
  });

  socket.on('vote', data => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }

    handleVote(room, socket, data);
  });

  socket.on('updateScore', votesData => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }

    for (const [answer, voters] of Object.entries(votesData.votes)) {
      const submitter = findAnswerSubmitter(room, votesData.prompt, answer);
      if (!submitter || !room.players.has(submitter)) {
        continue;
      }

      const player = room.players.get(submitter);
      const roundScore = room.state.round * voters.length * 100;
      player.roundScore += roundScore;

      if (submitter in room.state.roundScores) {
        room.state.roundScores[submitter] += roundScore;
      } else {
        room.state.roundScores[submitter] = roundScore;
      }
    }

    room.state.votes = {};
    updateAll(room);
  });

  socket.on('nextPrompt', data => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }

    room.state.currentPrompt = data;
    for (const [, player] of room.players) {
      player.state = 5;
    }
    updateAll(room);
  });

  socket.on('finishVoting', () => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }

    room.state.currentPrompt = null;
    handleNext(room);
  });

  socket.on('advance/next', () => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }

    handleNext(room);
  });
});

if (module === require.main) {
  startServer();
}

module.exports = server;
