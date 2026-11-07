import { expect, test } from '@playwright/test';
import messages from '../messages/ar.json' with { type: 'json' };
import { signInAs } from './session';

test('sends a visitor without a session from the app to sign-in', async ({ page }) => {
  await page.goto('/accounts');

  await expect(page).toHaveURL('/sign-in');
});

test('hides the administration from a user without the admin role', async ({ page }) => {
  await signInAs(page.request, 'user');

  await page.goto('/accounts');
  await expect(page.getByRole('link', { name: messages.nav.admin })).toHaveCount(0);

  const response = await page.goto('/admin');
  expect(response?.status()).toBe(404);
});

test('shows the administration to an admin', async ({ page }) => {
  await signInAs(page.request, 'admin');

  await page.goto('/accounts');
  await page.getByRole('link', { name: messages.nav.admin }).click();

  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('link', { name: messages.nav.admin })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('answers an unknown page with 404', async ({ page }) => {
  const response = await page.goto('/no-such-page');

  expect(response?.status()).toBe(404);
});

test('keeps the chosen theme across visits', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');

  await page.getByRole('button', { name: messages.theme.toDark }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: messages.theme.toLight })).toBeVisible();
});

test('signs out back to the landing page', async ({ page }) => {
  await signInAs(page.request, 'user');
  await page.goto('/accounts');

  await page.getByRole('button', { name: messages.auth.signOut }).click();

  await expect(page).toHaveURL('/');
  await page.goto('/accounts');
  await expect(page).toHaveURL('/sign-in');
});
