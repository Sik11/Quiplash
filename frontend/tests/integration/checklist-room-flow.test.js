const test = require('node:test');
const assert = require('node:assert/strict');
const { SocketTestClient, makeUser } = require('./helpers/socket-test-helpers');

test('room creation, join, and room isolation work', async () => {
  const adminA = new SocketTestClient('adminA');
  const playerA = new SocketTestClient('playerA');
  const adminB = new SocketTestClient('adminB');

  await Promise.all([adminA.connect(), playerA.connect(), adminB.connect()]);

  const users = {
    adminA: makeUser('ira'),
    playerA: makeUser('irb'),
    adminB: makeUser('irc')
  };

  adminA.emit('register', users.adminA);
  await adminA.once('reg_success');
  playerA.emit('register', users.playerA);
  await playerA.once('reg_success');
  adminB.emit('register', users.adminB);
  await adminB.once('reg_success');

  adminA.emit('room/create');
  const roomA = await adminA.once('room_created');
  adminB.emit('room/create');
  const roomB = await adminB.once('room_created');

  assert.notEqual(roomA.roomCode, roomB.roomCode);

  playerA.emit('room/select', { roomCode: roomA.roomCode });
  await playerA.once('room_selected');
  await adminA.waitFor(() => adminA.latestState && Object.keys(adminA.latestState.players).length === 2);
  assert.equal(Object.keys(adminB.latestState.players).length, 1);

  adminB.emit('chat', 'isolated-message');
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(adminA.messages.some(message => message.text === 'isolated-message'), false);

  [adminA, playerA, adminB].forEach(client => client.disconnect());
});
