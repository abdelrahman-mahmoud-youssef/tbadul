import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import messages from '../messages/ar.json' with { type: 'json' };
import { audit } from './audit';

const password = 'correct horse battery staple';
const credentials = messages.credentials;

const fill = async (page: Page, fields: Record<string, string>) => {
  for (const [label, value] of Object.entries(fields)) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
};

const register = async (page: Page, email: string) => {
  await page.goto('/sign-up');
  await fill(page, {
    [credentials.name]: 'Performer',
    [credentials.email]: email,
    [credentials.password]: password,
    [credentials.confirmPassword]: password,
  });
  await page.getByRole('button', { name: messages.signUp.submit }).click();
};

const signIn = async (page: Page, email: string, secret = password) => {
  await fill(page, { [credentials.email]: email, [credentials.password]: secret });
  await page.getByRole('button', { name: messages.signIn.submit }).click();
};

test('registers, lands on the accounts page and keeps the session across a reload', async ({
  page,
}) => {
  await register(page, `${randomUUID()}@example.test`);

  await expect(page).toHaveURL('/accounts');
  await expect(
    page.getByRole('heading', { level: 1, name: messages.accounts.title }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL('/accounts');
});

test('refuses a confirmation that differs from the password', async ({ page }) => {
  await page.goto('/sign-up');
  await fill(page, {
    [credentials.name]: 'Performer',
    [credentials.email]: `${randomUUID()}@example.test`,
    [credentials.password]: password,
    [credentials.confirmPassword]: `${password} x`,
  });
  await page.getByRole('button', { name: messages.signUp.submit }).click();

  await expect(
    page.getByRole('alert').filter({ hasText: credentials.failures.passwordMismatch }),
  ).toBeVisible();
  await expect(page).toHaveURL('/sign-up');
  await audit(page, 'sign-up-error');
});

test('refuses an email that is already registered', async ({ page, context }) => {
  const email = `${randomUUID()}@example.test`;
  await register(page, email);
  await expect(page).toHaveURL('/accounts');
  await context.clearCookies();

  await register(page, email);

  await expect(
    page.getByRole('alert').filter({ hasText: credentials.failures.emailTaken }),
  ).toBeVisible();
});

test('refuses a wrong password in Arabic and signs in with the correct one', async ({
  page,
  context,
}) => {
  const email = `${randomUUID()}@example.test`;
  await register(page, email);
  await expect(page).toHaveURL('/accounts');
  await context.clearCookies();
  await page.goto('/sign-in');

  await signIn(page, email, 'a wrong password');
  await expect(
    page.getByRole('alert').filter({ hasText: credentials.failures.invalidCredentials }),
  ).toBeVisible();
  await audit(page, 'sign-in-error');

  await signIn(page, email);
  await expect(page).toHaveURL('/accounts');
});

test('signs out and signs back in', async ({ page }) => {
  const email = `${randomUUID()}@example.test`;
  await register(page, email);
  await expect(page).toHaveURL('/accounts');

  await page.getByRole('button', { name: messages.auth.signOut }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/sign-in');
  await signIn(page, email);

  await expect(page).toHaveURL('/accounts');
});

test('returns to the page that was asked for after signing in', async ({ page, context }) => {
  const email = `${randomUUID()}@example.test`;
  await register(page, email);
  await expect(page).toHaveURL('/accounts');
  await context.clearCookies();

  await page.goto('/accounts/link');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Faccounts%2Flink$/);
  await signIn(page, email);

  await expect(page).toHaveURL('/accounts/link');
  await expect(page.getByRole('heading', { level: 1, name: messages.link.title })).toBeVisible();
});

test('ignores a next address that leaves the site', async ({ page }) => {
  const email = `${randomUUID()}@example.test`;
  await register(page, email);
  await expect(page).toHaveURL('/accounts');
  await page.getByRole('button', { name: messages.auth.signOut }).click();

  await page.goto('/sign-in?next=https%3A%2F%2Fexample.com');
  await signIn(page, email);

  await expect(page).toHaveURL('/accounts');
});

test('answers a refused sign-in attempt with the rate-limit message', async ({ page }) => {
  await page.route('**/api/auth/sign-in/email', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
    }),
  );
  await page.goto('/sign-in');

  await signIn(page, `${randomUUID()}@example.test`);

  await expect(
    page.getByRole('alert').filter({ hasText: credentials.failures.rateLimited }),
  ).toBeVisible();
});
