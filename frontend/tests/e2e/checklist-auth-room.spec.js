const { test, expect } = require('@playwright/test');
const { createRoom, loginOrRegister, makeUser } = require('./helpers/session');

test.describe('Checklist - Auth And Room Flow', () => {
  test('auth-first flow, create room, and room-aware invite targeting', async ({ page }) => {
    const hostUser = makeUser('pwa');

    await loginOrRegister(page, hostUser);
    const roomCode = await createRoom(page);

    await expect(page.getByText('Players are gathering')).toBeVisible();
    await expect(page.locator('.share-link').first()).toHaveText(roomCode);
    await expect(page.getByRole('button', { name: 'Copy Join Link' })).toBeVisible();
    await expect(page.locator('.player-card', { hasText: hostUser.username }).first()).toBeVisible();

    await page.goto('/?room=' + roomCode);

    await expect(page.getByText('Players are gathering')).toBeVisible();
    await expect(page.locator('.share-link').first()).toHaveText(roomCode);
  });
});
