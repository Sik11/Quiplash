const { expect } = require('@playwright/test');

function makeUser(prefix) {
  const seed = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    username: (prefix + seed).slice(0, 12),
    password: 'Passw0rd1234'
  };
}

async function loginOrRegister(page, user) {
  await page.goto('/');
  await expect(page.getByText('Sign in before joining a game')).toBeVisible();
  await page.getByPlaceholder('Enter your username').fill(user.username);
  await page.getByPlaceholder('Enter your password').fill(user.password);
  await page.getByRole('button', { name: 'Login' }).click();

  const loginError = page.getByText('Username or password incorrect');
  const backendUnavailable = page.getByText(/service is unavailable/i);

  await Promise.race([
    page.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible' }),
    page.getByRole('button', { name: 'Start a Game' }).waitFor({ state: 'visible' }),
    loginError.waitFor({ state: 'visible' }).catch(() => null),
    backendUnavailable.waitFor({ state: 'visible' }).catch(() => null)
  ]);

  if (await backendUnavailable.isVisible().catch(() => false)) {
    throw new Error('Backend unavailable during login/register flow.');
  }

  if (await loginError.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('button', { name: 'Register' }).click();
  }

  const continueButton = page.getByRole('button', { name: 'Continue' });
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  }

  await expect(page.getByRole('button', { name: 'Start a Game' })).toBeVisible();
}

async function createRoom(page) {
  await expect(page.getByRole('button', { name: 'Start a Game' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a Game' }).click();
  await expect(page.locator('.share-link').first()).toBeVisible();
  return (await page.locator('.share-link').first().innerText()).trim();
}

async function joinRoom(page, roomCode) {
  await expect(page.getByRole('button', { name: 'Join a Game' })).toBeVisible();
  await page.getByRole('button', { name: 'Join a Game' }).click();
  await page.getByPlaceholder('Enter code').fill(roomCode);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.share-link').first()).toBeVisible();
}

module.exports = {
  createRoom,
  joinRoom,
  loginOrRegister,
  makeUser
};
