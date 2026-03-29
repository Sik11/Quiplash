const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SocketTestClient,
  delay,
  makeUser,
  registerClient,
  createRoomForClient,
  joinRoomForClient,
  disconnectAll
} = require('./helpers/socket-test-helpers');

async function waitForPhase(client, phase, round) {
  await client.waitFor(() => {
    return client.latestState
      && client.latestState.state
      && client.latestState.state.state === phase
      && (round == null || client.latestState.state.round === round);
  }, 10_000);
}

async function submitRoundPrompts(players, roundNumber) {
  for (const [index, player] of players.entries()) {
    player.emit('prompt', {
      prompt: `Round ${roundNumber} prompt from player ${index} with enough length.`
    });
  }

  await players[0].waitFor(() => {
    return players[0].latestState
      && Object.keys(players[0].latestState.suggestedPrompts || {}).length === players.length;
  }, 10_000);
}

async function submitRoundAnswers(players, roundNumber) {
  for (const [index, player] of players.entries()) {
    await player.waitFor(() => {
      return player.latestState
        && player.latestState.me
        && Array.isArray(player.latestState.me.roundPrompts)
        && player.latestState.me.roundPrompts.length > 0;
    }, 10_000);

    const answers = {};
    player.latestState.me.roundPrompts.forEach((prompt, promptIndex) => {
      answers[prompt] = `Round ${roundNumber} answer ${index}-${promptIndex}`;
    });
    player.emit('answer', answers);
  }

  await players[0].waitFor(() => {
    return players[0].latestState
      && players[0].latestState.state
      && Object.keys(players[0].latestState.state.playerAnswers || {}).length === players.length;
  }, 10_000);
}

async function resolveVoting(admin, players) {
  const promptOrder = Object.keys(admin.latestState.state.promptPlayers);

  for (const prompt of promptOrder) {
    await admin.waitFor(() => admin.latestState.state.currentPrompt === prompt, 10_000);
    await admin.waitFor(() => {
      const answers = admin.latestState.state.answers[admin.latestState.state.currentPrompt] || [];
      return answers.length >= 2;
    }, 10_000);

    const currentPrompt = admin.latestState.state.currentPrompt;
    const answers = admin.latestState.state.answers[currentPrompt];
    const chosenAnswer = answers[0];

    for (const player of players) {
      player.emit('vote', chosenAnswer);
    }

    await admin.waitFor(() => {
      return admin.latestState
        && admin.latestState.state
        && Object.keys(admin.latestState.state.votes || {}).length > 0;
    }, 10_000);

    admin.emit('updateScore', {
      prompt: currentPrompt,
      votes: admin.latestState.state.votes
    });

    if (prompt !== promptOrder[promptOrder.length - 1]) {
      const nextPrompt = promptOrder[promptOrder.indexOf(prompt) + 1];
      admin.emit('nextPrompt', nextPrompt);
    } else {
      admin.emit('finishVoting');
    }
  }
}

async function playRound(admin, players, roundNumber) {
  await waitForPhase(admin, 1, roundNumber);
  await submitRoundPrompts(players, roundNumber);
  admin.emit('advance/next');

  await waitForPhase(admin, 2, roundNumber);
  await submitRoundAnswers(players, roundNumber);
  admin.emit('advance/next');

  await waitForPhase(admin, 3, roundNumber);
  await resolveVoting(admin, players);

  await waitForPhase(admin, 4, roundNumber);
}

test('full gameplay flow reaches game over, keeps scores, and can return to the lobby', async () => {
  const admin = new SocketTestClient('gameAdmin');
  const player2 = new SocketTestClient('gameP2');
  const player3 = new SocketTestClient('gameP3');
  const audience = new SocketTestClient('gameAudience');
  const clients = [admin, player2, player3, audience];

  await Promise.all(clients.map(client => client.connect()));

  const users = [makeUser('gfa'), makeUser('gfb'), makeUser('gfc'), makeUser('gfd')];
  await registerClient(admin, users[0]);
  await registerClient(player2, users[1]);
  await registerClient(player3, users[2]);
  await registerClient(audience, users[3]);

  const room = await createRoomForClient(admin);
  await joinRoomForClient(player2, room.roomCode);
  await joinRoomForClient(player3, room.roomCode);
  await admin.waitFor(() => admin.latestState && Object.keys(admin.latestState.players).length === 3, 10_000);

  admin.emit('chat', 'hello from the host');
  await delay(100);
  const hostChat = player2.messages.find(message => message.text === 'hello from the host');
  assert.equal(hostChat.sender, users[0].username);
  assert.equal(hostChat.senderType, 'player');
  assert.ok(player2.messages.some(message => message.senderType === 'system'));

  admin.emit('admin', 'start');
  await waitForPhase(admin, 1, 1);

  await joinRoomForClient(audience, room.roomCode);
  await audience.waitFor(() => audience.latestState && audience.latestState.me && audience.latestState.me.audience === true, 10_000);
  await admin.waitFor(() => admin.latestState && Object.keys(admin.latestState.audience).length === 1, 10_000);

  await playRound(admin, [admin, player2, player3], 1);
  assert.ok(Object.keys(admin.latestState.state.roundScores).length > 0);
  admin.emit('advance/next');

  await playRound(admin, [admin, player2, player3], 2);
  assert.ok(Object.keys(admin.latestState.state.totalScores).length > 0);
  admin.emit('advance/next');

  await playRound(admin, [admin, player2, player3], 3);
  admin.emit('advance/next');

  await waitForPhase(admin, 5, 3);
  assert.ok(Object.keys(admin.latestState.state.totalScores).length > 0);

  const audienceReset = audience.once('audience_reset', 10_000);
  admin.emit('admin', 'returnToLobby');
  await waitForPhase(admin, 0, 0);
  await admin.waitFor(() => {
    return admin.latestState
      && admin.latestState.state
      && admin.latestState.state.round === 0
      && Object.keys(admin.latestState.state.totalScores || {}).length === 0;
  }, 10_000);
  const audienceResetPayload = await audienceReset;
  assert.match(audienceResetPayload.message, /game has ended/i);
  assert.equal(admin.latestState.audience ? Object.keys(admin.latestState.audience).length : 0, 0);

  disconnectAll(clients);
});
