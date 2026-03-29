const test = require('node:test');
const assert = require('node:assert/strict');
const { SocketTestClient, makeUser } = require('./helpers/socket-test-helpers');

test('reconnect restores a player slot within the grace window', async () => {
  const admin = new SocketTestClient('reconnectAdmin');
  const player = new SocketTestClient('reconnectPlayer');
  await Promise.all([admin.connect(), player.connect()]);

  const users = {
    admin: makeUser('rta'),
    player: makeUser('rtb')
  };

  admin.emit('register', users.admin);
  await admin.once('reg_success');
  player.emit('register', users.player);
  await player.once('reg_success');

  admin.emit('room/create');
  const room = await admin.once('room_created');
  player.emit('room/select', { roomCode: room.roomCode });
  await player.once('room_selected');
  await admin.waitFor(() => admin.latestState && Object.keys(admin.latestState.players).length === 2);

  player.disconnect();

  const returnPlayer = new SocketTestClient('returnPlayer');
  await returnPlayer.connect();
  returnPlayer.emit('login', users.player);
  await returnPlayer.once('login_success');
  returnPlayer.emit('room/select', { roomCode: room.roomCode });
  await returnPlayer.once('room_selected');
  await returnPlayer.waitFor(() => returnPlayer.latestState && returnPlayer.latestState.me && returnPlayer.latestState.me.name === users.player.username);

  assert.equal(returnPlayer.latestState.me.name, users.player.username);

  [admin, returnPlayer].forEach(client => client.disconnect());
});

test('moderation rejects blocked chat and prompt content', async () => {
  const admin = new SocketTestClient('moderationAdmin');
  const player2 = new SocketTestClient('moderationP2');
  const player3 = new SocketTestClient('moderationP3');
  await Promise.all([admin.connect(), player2.connect(), player3.connect()]);

  const users = [makeUser('mta'), makeUser('mtb'), makeUser('mtc')];
  admin.emit('register', users[0]);
  await admin.once('reg_success');
  player2.emit('register', users[1]);
  await player2.once('reg_success');
  player3.emit('register', users[2]);
  await player3.once('reg_success');

  admin.emit('room/create');
  const room = await admin.once('room_created');
  player2.emit('room/select', { roomCode: room.roomCode });
  await player2.once('room_selected');
  player3.emit('room/select', { roomCode: room.roomCode });
  await player3.once('room_selected');

  admin.emit('chat', 'this is shit');
  const chatError = await admin.once('fail');
  assert.match(chatError, /moderation filter/i);

  admin.emit('admin', 'start');
  await admin.waitFor(() => admin.latestState && admin.latestState.state.state === 1);
  admin.emit('prompt', { prompt: 'This fucking prompt should be blocked immediately.' });
  const promptError = await admin.once('fail');
  assert.match(promptError, /moderation filter/i);

  [admin, player2, player3].forEach(client => client.disconnect());
});
