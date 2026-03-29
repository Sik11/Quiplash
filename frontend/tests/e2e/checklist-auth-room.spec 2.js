const { test, expect } = require('@playwright/test');
const { createRoom, joinRoom, loginOrRegister, makeUser } = require('./helpers/session');

test.describe('Checklist - Auth And Room Flow', () => {
  test('auth-first flow, create room, join room, and room-aware invite link', async ({ browser }) => {
    const hostContext = await browser.newContext({ recordVideo: { dir: 'playwright-artifacts/videos' } });
    const guestContext = await browser.newContext({ recordVideo: { dir: 'playwright-artifacts/videos' } });

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    const hostUser = makeUser('pwa');
    const guestUser = makeUser('pwb');

    await loginOrRegister(hostPage, hostUser);
    const roomCode = await createRoom(hostPage);

    await expect(hostPage.getByText('Players are gathering')).toBeVisible();
    await expect(hostPage.getByText(roomCode)).toBeVisible();
    await expect(hostPage.getByRole('button', { name: 'Copy Join Link' })).toBeVisible();

    await loginOrRegister(guestPage, guestUser);
    await joinRoom(guestPage, roomCode);

    await expect(hostPage.getByText(hostUser.username)).toBeVisible();
    await expect(hostPage.getByText(guestUser.username)).toBeVisible();
    await expect(guestPage.getByText(hostUser.username)).toBeVisible();

    const invitePage = await browser.newPage();
    await invitePage.goto('/?room=' + roomCode);
    await loginOrRegister(invitePage, makeUser('pwc'));
    await expect(invitePage.getByPlaceholder('Enter code')).toHaveValue(roomCode);

    await hostContext.close();
    await guestContext.close();
    await invitePage.context().close();
  });
});
