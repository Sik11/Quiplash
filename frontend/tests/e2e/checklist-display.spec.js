const { test, expect } = require('@playwright/test');
const { createRoom, loginOrRegister, makeUser } = require('./helpers/session');

test.describe('Checklist - Room Aware Display', () => {
  test('display can target a specific room and show public state', async ({ page }) => {
    const hostUser = makeUser('pwd');
    await loginOrRegister(page, hostUser);
    const roomCode = await createRoom(page);

    await page.goto('/display?room=' + roomCode);

    await expect(page.getByText('Room ' + roomCode)).toBeVisible();
    await expect(page.getByText('Live game display')).toBeVisible();
    await expect(page.getByText('Lobby')).toBeVisible();
  });
});
