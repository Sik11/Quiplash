const { test, expect } = require('@playwright/test');
const { createRoom, loginOrRegister, makeUser } = require('./helpers/session');

if (!process.env.QA_FRONTEND_URL) {
  process.env.QA_FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080';
}

const {
  SocketTestClient,
  registerClient,
  joinRoomForClient,
  disconnectAll
} = require('../integration/helpers/socket-test-helpers');

test.describe('Checklist - Lobby And Error States', () => {
  test('lobby updates live, copy link works, and audience count increases after the game starts', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const hostUser = makeUser('lba');
    await loginOrRegister(page, hostUser);
    const roomCode = await createRoom(page);

    await expect(page.getByText('Waiting for 2 more player(s)')).toBeVisible();
    await page.getByRole('button', { name: 'Copy Join Link' }).click();
    await expect(page.getByText('Join link copied.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`?room=${roomCode}`);

    const player2 = new SocketTestClient('lobbyP2');
    const player3 = new SocketTestClient('lobbyP3');
    const audience = new SocketTestClient('lobbyAudience');
    const clients = [player2, player3, audience];

    await Promise.all(clients.map(client => client.connect()));
    await registerClient(player2, makeUser('lbb'));
    await registerClient(player3, makeUser('lbc'));
    await registerClient(audience, makeUser('lbd'));

    await joinRoomForClient(player2, roomCode);
    await joinRoomForClient(player3, roomCode);

    await expect(page.getByText('Ready to start the game!')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
    await expect(page.getByText('3 players')).toBeVisible();

    await page.getByRole('button', { name: 'Start Game' }).click();
    await expect(page.getByText('Write a strong prompt')).toBeVisible();

    await joinRoomForClient(audience, roomCode);
    await expect(page.getByText('1 audience')).toBeVisible();

    disconnectAll(clients);
  });

  test('join and display flows show clear errors for missing or invalid room codes', async ({ page }) => {
    await loginOrRegister(page, makeUser('lbe'));

    await page.getByRole('button', { name: 'Join a Game' }).click();
    await expect(page.getByText('Enter the room code')).toBeVisible();

    await page.getByPlaceholder('Enter code').fill('NOPE1');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('That room code does not exist.')).toBeVisible();

    await page.goto('/display');
    await expect(page.getByText('Choose a room to display')).toBeVisible();

    await page.getByPlaceholder('Enter code').fill('NOPE1');
    await page.getByRole('button', { name: 'Open Display' }).click();
    await expect(page.getByText('That room code does not exist.')).toBeVisible();
  });
});
