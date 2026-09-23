import { test, expect, Browser, Page } from '@playwright/test';

/**
 * A real game between two browsers, on the dev server's in-memory game server: the same handler
 * the Vercel Functions run, so this covers the client, the event streams and the rules together.
 */

async function joinAs(browser: Browser, name: string) {
  const context = await browser.newContext();
  await context.addInitScript((playerName) => {
    window.localStorage.setItem('emoji-guesser-player-name', playerName);
  }, name);
  return { context, page: await context.newPage() };
}

async function describerOf(pages: Page[]) {
  await expect
    .poll(async () => {
      for (const page of pages) if (await page.getByRole('heading', { name: /Pick a word/i }).isVisible()) return true;
      return false;
    }, { timeout: 10_000 })
    .toBe(true);
  for (const page of pages) if (await page.getByRole('heading', { name: /Pick a word/i }).isVisible()) return page;
  throw new Error('nobody was asked to pick a word');
}

test('two players play a round against the real game server', async ({ browser }) => {
  const ann = await joinAs(browser, 'Ann');
  const bob = await joinAs(browser, 'Bob');

  await ann.page.goto('/');
  await expect(ann.page.locator('.conn-pill')).toContainText('Connected');
  await ann.page.getByRole('button', { name: 'Create New Game' }).click();
  const invite = new URL(await ann.page.locator('.invite-block code').innerText());

  await bob.page.goto(`/${invite.search}`);
  await expect(bob.page.getByText('Waiting for the host to start')).toBeVisible();
  await expect(ann.page.getByRole('button', { name: 'Bob' })).toBeVisible();

  await ann.page.getByRole('button', { name: /Start Game/ }).click();
  const describer = await describerOf([ann.page, bob.page]);
  const guesser = describer === ann.page ? bob.page : ann.page;
  const guesserName = describer === ann.page ? 'Bob' : 'Ann';

  const choice = describer.locator('.word-choice').first();
  const word = (await choice.evaluate((button) => button.lastChild?.textContent ?? '')).trim();
  await choice.click();
  await expect(describer.getByText(word, { exact: true }).first()).toBeVisible();
  await expect(guesser.getByText(/is now describing! Start guessing!/)).toBeVisible();
  await expect(guesser.locator('.hint-letter').first()).toBeVisible();

  // The describer's word never reaches the guesser's browser.
  expect(await guesser.content()).not.toContain(`>${word}<`);

  await describer.locator('.epr-emoji-category-content button').first().click();
  await expect(guesser.locator('.canvas-emoji')).toHaveCount(1);

  await guesser.getByPlaceholder('Type your guess...').fill('definitely-not-it');
  await guesser.getByPlaceholder('Type your guess...').press('Enter');
  await expect(describer.getByText('definitely-not-it', { exact: true })).toBeVisible();

  await guesser.getByPlaceholder('Type your guess...').fill(word);
  await guesser.getByPlaceholder('Type your guess...').press('Enter');
  const announcement = `${guesserName} guessed correctly! The word was: ${word}`;
  await expect(describer.getByText(announcement)).toBeVisible();
  await expect(guesser.getByText(announcement)).toBeVisible();

  // The next turn goes to the other player.
  await expect(guesser.getByRole('heading', { name: /Pick a word/i })).toBeVisible({ timeout: 10_000 });

  await ann.context.close();
  await bob.context.close();
});
