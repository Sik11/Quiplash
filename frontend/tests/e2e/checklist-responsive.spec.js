const { test, expect } = require('@playwright/test');
const { loginOrRegister, makeUser } = require('./helpers/session');

test.describe('Checklist - Responsive UI', () => {
  test('mobile layout keeps auth and room actions usable', async ({ page }) => {
    await loginOrRegister(page, makeUser('pwm'));
    await expect(page.getByRole('button', { name: 'Start a Game' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join a Game' })).toBeVisible();
    await expect(page.getByText('Create a room or join one with a code')).toBeVisible();
  });
});
