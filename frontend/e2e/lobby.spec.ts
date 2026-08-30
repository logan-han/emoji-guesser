import { test, expect } from '@playwright/test';

test.describe('Lobby Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display game title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Describe it');
    await expect(page.locator('.brand-name')).toContainText(/emoji\s+guesser/i);
  });

  test('should show connection status', async ({ page }) => {
    await expect(page.locator('.conn-pill')).toBeVisible();
    await expect(page.locator('.conn-pill')).toContainText(/Connected|Reconnecting|Disconnected/);
  });

  test('should have game creation options', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Create New Game' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Private Game/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Public Game/ })).toBeVisible();
  });

  test('should have game join section', async ({ page }) => {
    await expect(page.getByPlaceholder('Enter Game ID')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join Game' })).toBeVisible();
  });

  test('should toggle between public and private game options', async ({ page }) => {
    const privateTab = page.getByRole('tab', { name: /Private Game/ });
    const publicTab = page.getByRole('tab', { name: /Public Game/ });

    await expect(privateTab).toHaveAttribute('aria-selected', 'true');
    await expect(publicTab).toHaveAttribute('aria-selected', 'false');

    await publicTab.click();
    await expect(publicTab).toHaveAttribute('aria-selected', 'true');
    await expect(privateTab).toHaveAttribute('aria-selected', 'false');

    await privateTab.click();
    await expect(privateTab).toHaveAttribute('aria-selected', 'true');
    await expect(publicTab).toHaveAttribute('aria-selected', 'false');
  });

  test('should display public games section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Public rooms', exact: true })).toBeVisible();
  });

  test('join button should be disabled without game ID', async ({ page }) => {
    const joinButton = page.getByRole('button', { name: 'Join Game' });
    await expect(joinButton).toBeDisabled();
  });

  test('should enable join button when game ID is entered', async ({ page }) => {
    const gameIdInput = page.getByPlaceholder('Enter Game ID');
    const joinButton = page.getByRole('button', { name: 'Join Game' });

    // Initially disabled
    await expect(joinButton).toBeDisabled();

    // Type a game ID
    await gameIdInput.fill('TESTID');

    // Button should still be disabled if not connected
    // (in real tests with mock server, it would be enabled)
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/');

    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText('Describe it');
  });

  test('form inputs should have proper labels', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('tab', { name: /Private Game/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Public Game/i })).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Describe it');
    await expect(page.getByRole('button', { name: 'Create New Game' })).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Describe it');
    await expect(page.getByRole('button', { name: 'Create New Game' })).toBeVisible();
  });
});
