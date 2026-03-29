const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SocketTestClient,
  makeUser,
  registerClient,
  createRoomForClient,
  joinRoomForClient,
  disconnectAll
} = require('./helpers/socket-test-helpers');

test('admin reassignment works and the new admin can continue the game', async () => {
  const admin = new SocketTestClient('disconnectAdmin');
  const player2 = new SocketTestClient('disconnectP2');
  const player3 = new SocketTestClient('disconnectP3');
  const clients = [admin, player2, player3];

  await Promise.all(clients.map(client => client.connect()));

  const users = [makeUser('daa'), makeUser('dab'), makeUser('dac')];
  await registerClient(admin, users[0]);
  await registerClient(player2, users[1]);
  await registerClient(player3, users[2]);

  const room = await createRoomForClient(admin);
  await joinRoomForClient(player2, room.roomCode);
  await joinRoomForClient(player3, room.roomCode);
  await player2.waitFor(() => player2.latestState && Object.keys(player2.latestState.players).length === 3, 10_000);

  admin.disconnect();

  await player2.waitFor(() => {
    return player2.latestState
      && Object.values(player2.latestState.players).some(player => player.name === users[1].username && player.admin === true);
  }, 20_000);

  assert.ok(player2.messages.some(message => /is now the admin and can control the game/i.test(message.text)));

  player2.emit('admin', 'start');
  await player2.waitFor(() => player2.latestState && player2.latestState.state.state === 1, 10_000);
  assert.equal(player2.latestState.state.state, 1);

  disconnectAll([player2, player3]);
});

test('an early disconnect resets the room back to the lobby instead of leaving it stuck', async () => {
  const admin = new SocketTestClient('earlyAdmin');
  const player2 = new SocketTestClient('earlyP2');
  const player3 = new SocketTestClient('earlyP3');
  const clients = [admin, player2, player3];

  await Promise.all(clients.map(client => client.connect()));

  const users = [makeUser('eba'), makeUser('ebb'), makeUser('ebc')];
  await registerClient(admin, users[0]);
  await registerClient(player2, users[1]);
  await registerClient(player3, users[2]);

  const room = await createRoomForClient(admin);
  await joinRoomForClient(player2, room.roomCode);
  await joinRoomForClient(player3, room.roomCode);
  await admin.waitFor(() => admin.latestState && Object.keys(admin.latestState.players).length === 3, 10_000);

  admin.emit('admin', 'start');
  await admin.waitFor(() => admin.latestState && admin.latestState.state.state === 1, 10_000);

  player2.disconnect();

  await admin.waitFor(() => admin.latestState && admin.latestState.state.state === 0, 20_000);
  assert.ok(admin.messages.some(message => /returning to the lobby/i.test(message.text)));

  disconnectAll([admin, player3]);
});
