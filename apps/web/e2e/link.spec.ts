import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import messages from '../messages/ar.json' with { type: 'json' };
import { audit } from './audit';
import { control, ensurePool, poolHandle, syncClock } from './control';
import { signInAs } from './session';

const handleOf = (): string => `creator_${randomUUID().slice(0, 8)}`;

const startLink = async (page: Page, handle: string) => {
  await page.goto('/accounts/link');
  await page.getByLabel(messages.link.accountLabel).fill(`@${handle}`);
  await page.getByRole('button', { name: messages.link.start }).click();
};

const verifyNow = (page: Page) =>
  page.getByRole('button', { name: messages.verify.action, exact: true });

const followTitle = (page: Page) => page.getByRole('heading', { name: messages.follow.title });

test.beforeAll(ensurePool);

test('shows an empty accounts page with five free slots and a link button', async ({ page }) => {
  await signInAs(page.request, 'user');
  await page.goto('/accounts');

  await expect(page.getByText(messages.accounts.emptyTitle)).toBeVisible();
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('link', { name: messages.accounts.linkAction })).toBeVisible();
  await audit(page, 'accounts-empty');
});

test('links an eligible account: not found yet, cooldown, then verified', async ({ page }) => {
  await syncClock();
  await page.clock.install();
  await signInAs(page.request, 'user');
  const handle = handleOf();

  await page.goto('/accounts/link');
  await audit(page, 'link-start');
  await startLink(page, handle);

  await expect(followTitle(page)).toBeVisible();
  await expect(page.getByText(`@${poolHandle}`).first()).toBeVisible();
  await expect(page.getByRole('link', { name: messages.follow.open })).toHaveAttribute(
    'href',
    `https://www.tiktok.com/@${poolHandle}`,
  );
  await audit(page, 'link-follow');

  await verifyNow(page).click();
  await expect(page.getByText(messages.verify.notFollowing.title)).toBeVisible();
  await expect(verifyNow(page)).toBeDisabled();
  await expect(page.getByText(messages.verify.waitLabel)).toBeVisible();
  await expect(page.getByText(messages.verify.nextAtLabel)).toBeVisible();
  await audit(page, 'link-not-found-yet');

  await page.reload();
  await expect(followTitle(page)).toBeVisible();
  await expect(verifyNow(page)).toBeDisabled();

  await control('/follows', { performer: handle, target: poolHandle });
  await control('/clock/advance', { ms: 30_000 });
  await page.clock.fastForward(30_000);
  await expect(verifyNow(page)).toBeEnabled();
  await verifyNow(page).click();

  await expect(page.getByRole('heading', { name: messages.receipt.title })).toBeVisible();
  await expect(page.getByText(`@${handle}`).first()).toBeVisible();
  await audit(page, 'link-linked');

  await page.getByRole('link', { name: messages.receipt.done }).click();
  await expect(page).toHaveURL('/accounts');
  await expect(page.getByText(`@${handle}`)).toBeVisible();
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '1');
  await audit(page, 'accounts-linked');
});

test('shows the server cooldown when verifying twice in a row', async ({ page }) => {
  await signInAs(page.request, 'user');
  await startLink(page, handleOf());
  await expect(followTitle(page)).toBeVisible();
  const claimId = new URL(page.url()).pathname.split('/').at(-1) ?? '';

  await verifyNow(page).click();
  await expect(page.getByText(messages.verify.notFollowing.title)).toBeVisible();

  const second = await page.request.post(`/api/claims/${claimId}/verify`);
  expect(second.status()).toBe(429);
  expect(await second.json()).toMatchObject({
    error: { code: 'cooldown_active', details: { waitMs: expect.any(Number) as unknown } },
  });
});

test('resumes an open claim after a reload and from the accounts list', async ({ page }) => {
  await signInAs(page.request, 'user');
  const handle = handleOf();
  await startLink(page, handle);
  await expect(followTitle(page)).toBeVisible();
  const claimUrl = page.url();

  await page.reload();
  await expect(followTitle(page)).toBeVisible();

  await page.goto('/accounts');
  await expect(page.getByText(messages.accounts.openTitle)).toBeVisible();
  await page.getByRole('link', { name: new RegExp(handle) }).click();
  await expect(page).toHaveURL(claimUrl);
  await audit(page, 'accounts-open-claim');
});

test('shows the rule-by-rule report with a fix for an ineligible account', async ({ page }) => {
  await signInAs(page.request, 'user');
  const handle = handleOf();
  await control('/profiles', { handle, followerCount: 3 });

  await startLink(page, handle);

  await expect(page.getByText(messages.eligibility.ineligible)).toBeVisible();
  await expect(page.getByText(messages.eligibility.reasons.followers_below_minimum)).toBeVisible();
  await expect(page.getByText(messages.closed.ineligible)).toBeVisible();
  await audit(page, 'link-ineligible');
});

test('tells a private account to make it public', async ({ page }) => {
  await signInAs(page.request, 'user');
  const handle = handleOf();
  await control('/profiles', { handle, isPrivate: true });

  await startLink(page, handle);

  await expect(page.getByText(messages.eligibility.reasons.account_private)).toBeVisible();
});

test('tells the user TikTok did not answer and that it does not count', async ({ page }) => {
  await signInAs(page.request, 'user');
  const handle = handleOf();
  await startLink(page, handle);
  await expect(followTitle(page)).toBeVisible();
  await control('/failing', { handle, failing: true });

  await verifyNow(page).click();

  await expect(page.getByText(messages.verify.sourceUnavailable.title)).toBeVisible();
  await expect(page.getByText(messages.verify.sourceUnavailable.body)).toBeVisible();
  await expect(verifyNow(page)).toBeEnabled();
  await audit(page, 'link-source-unavailable');
  await control('/failing', { handle, failing: false });
});

test('cancels an open claim and frees its slot', async ({ page }) => {
  await signInAs(page.request, 'user');
  await startLink(page, handleOf());
  await expect(followTitle(page)).toBeVisible();

  await page.getByRole('button', { name: messages.verify.cancel }).click();

  await expect(page).toHaveURL('/accounts');
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
});

test('removes a linked account after confirming', async ({ page }) => {
  await signInAs(page.request, 'user');
  const handle = handleOf();
  await startLink(page, handle);
  await expect(followTitle(page)).toBeVisible();
  await control('/follows', { performer: handle, target: poolHandle });
  await verifyNow(page).click();
  await expect(page.getByRole('heading', { name: messages.receipt.title })).toBeVisible();
  await page.goto('/accounts');

  await page.getByRole('button', { name: `${messages.accounts.remove} @${handle}` }).click();
  await audit(page, 'accounts-remove-confirm');
  await page.getByRole('button', { name: messages.accounts.removeConfirm }).click();

  await expect(page.getByText(`@${handle}`)).toHaveCount(0);
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
});

test('lets an admin add a verification account and deactivate it', async ({ page }) => {
  await signInAs(page.request, 'admin');
  const handle = handleOf();
  await page.goto('/admin');

  await page.getByLabel(messages.admin.addLabel).fill(handle);
  await page.getByRole('button', { name: messages.admin.addSubmit }).click();
  await expect(page.getByText(messages.admin.statuses.added)).toBeVisible();
  await expect(page.getByText(`@${handle}`)).toBeVisible();

  const row = page.getByRole('listitem').filter({ hasText: `@${handle}` });
  await row.getByRole('button', { name: messages.admin.deactivate }).click();
  await expect(row.getByRole('button', { name: messages.admin.activate })).toBeVisible();
  await audit(page, 'admin-pool');
});
