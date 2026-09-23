import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for game flows against a mocked game API.
 * These tests verify the UI behaviour without a real backend; multiplayer.spec.ts plays a real game.
 */

// Answer each action with canned messages; no event stream is ever opened.
async function mockApi(page: Page, responses: Record<string, any | any[]>) {
  const replies = { hello: { action: 'connected', connectionId: 'test-conn-123' }, ...responses };
  await page.route('**/api/action', async (route) => {
    const { action } = route.request().postDataJSON();
    const reply = replies[action];
    const messages = reply === undefined ? [] : Array.isArray(reply) ? reply : [reply];
    await route.fulfill({ json: { messages } });
  });
  await page.route('**/api/events**', (route) => route.fulfill({ status: 404, json: { error: 'no such game' } }));
}

async function expectConnected(page: Page) {
  await expect(page.locator('.conn-pill')).toContainText('Connected', { timeout: 5000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('emoji-guesser-player-name', 'TestPlayer');
  });
});

test.describe('Game Creation Flow', () => {
  test('should create a new game and show lobby', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameCreated',
        game: {
          gameId: 'ABC123',
          gameState: 'WAITING',
          players: [{ name: 'Player 1', connectionId: 'test-conn-123', score: 0 }],
          ownerId: 'test-conn-123',
          ownerSessionId: 'test-session',
          timeLimit: 120,
          maxRounds: 2
        }
      }
    });

    await page.goto('/');

    // Wait for connection
    await expectConnected(page);

    // Click create game
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByText(/Room .*ABC123/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: /Share this link/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy link/i })).toBeVisible();
  });

  test('should show game settings for owner', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameCreated',
        game: {
          gameId: 'ABC123',
          gameState: 'WAITING',
          players: [{ name: 'Player 1', connectionId: 'test-conn-123', score: 0 }],
          ownerId: 'test-conn-123',
          ownerSessionId: 'test-session',
          timeLimit: 120,
          maxRounds: 2
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('heading', { name: /Round rules/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Round time/)).toBeVisible();
    await expect(page.getByText(/Total rounds/)).toBeVisible();
  });
});

test.describe('Game Lobby', () => {
  test('should display player list', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameCreated',
        game: {
          gameId: 'ABC123',
          gameState: 'WAITING',
          players: [
            { name: 'Player 1', connectionId: 'test-conn-123', score: 0 },
            { name: 'Player 2', connectionId: 'other-conn', score: 0 }
          ],
          ownerId: 'test-conn-123'
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('heading', { name: /Players/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Player 1')).toBeVisible();
  });

  test('should copy invite link to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await mockApi(page, {
      createGame: {
        action: 'gameCreated',
        game: {
          gameId: 'ABC123',
          gameState: 'WAITING',
          players: [{ name: 'Player 1', connectionId: 'test-conn-123', score: 0 }],
          ownerId: 'test-conn-123'
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('heading', { name: /Share this link/i })).toBeVisible({ timeout: 5000 });

    // Click copy button
    await page.getByRole('button', { name: /Copy link/i }).click();

    // Should show copied feedback
    await expect(page.getByText(/Copied/i)).toBeVisible();
  });

  test('should allow editing player name', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameCreated',
        game: {
          gameId: 'ABC123',
          gameState: 'WAITING',
          players: [{ name: 'Player 1', connectionId: 'test-conn-123', score: 0 }],
          ownerId: 'test-conn-123'
        }
      },
      updatePlayerName: {
        action: 'playerNameUpdated',
        game: {
          gameId: 'ABC123',
          gameState: 'WAITING',
          players: [{ name: 'NewName', connectionId: 'test-conn-123', score: 0 }],
          ownerId: 'test-conn-123'
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    // Click to edit name
    const playerNameButton = page.getByRole('button', { name: /Player 1.*click to edit/i });
    await expect(playerNameButton).toBeVisible({ timeout: 5000 });
    await playerNameButton.click();

    // Input should appear
    const nameInput = page.getByPlaceholder('Enter your name (required)');
    await expect(nameInput).toBeVisible();
  });
});

test.describe('Game In Progress', () => {
  test('should display game in progress view', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameStarted',
        game: {
          gameId: 'ABC123',
          gameState: 'IN_PROGRESS',
          players: [
            { name: 'Player 1', connectionId: 'test-conn-123', score: 0 },
            { name: 'Player 2', connectionId: 'other-conn', score: 0 }
          ],
          ownerId: 'test-conn-123',
          currentRound: 1,
          currentDescriberIndex: 1,
          turnState: 'DESCRIBING',
          timeLimit: 120
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.locator('[data-screen-label^="03 Game"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Scoreboard/)).toBeVisible();
  });

  test('should show word choosing view for describer', async ({ page }) => {
    await mockApi(page, {
      createGame: [
        {
          action: 'gameStarted',
          game: {
            gameId: 'ABC123',
            gameState: 'IN_PROGRESS',
            players: [
              { name: 'Player 1', connectionId: 'test-conn-123', score: 0 },
              { name: 'Player 2', connectionId: 'other-conn', score: 0 }
            ],
            ownerId: 'test-conn-123',
            currentRound: 1,
            currentDescriberIndex: 0,
            turnState: 'CHOOSING_WORD'
          }
        },
        { action: 'chooseWord', wordOptions: ['elephant', 'pizza', 'bicycle'] }
      ]
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('heading', { name: /Pick a word/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'elephant' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'pizza' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'bicycle' })).toBeVisible();
  });

  test('should show guess input for non-describer', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameStarted',
        game: {
          gameId: 'ABC123',
          gameState: 'IN_PROGRESS',
          players: [
            { name: 'Player 1', connectionId: 'test-conn-123', score: 0 },
            { name: 'Player 2', connectionId: 'other-conn', score: 0 }
          ],
          ownerId: 'test-conn-123',
          currentRound: 1,
          currentDescriberIndex: 1, // Other player is describer
          turnState: 'DESCRIBING',
          currentHint: '_ _ _ _ _ _ _'
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByPlaceholder('Type your guess...')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Guess', exact: true })).toBeVisible();
  });
});

test.describe('Game End', () => {
  test('should display game ended view with scores', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameEnded',
        game: {
          gameId: 'ABC123',
          gameState: 'ENDED',
          players: [
            { name: 'Player 1', connectionId: 'test-conn-123', score: 150 },
            { name: 'Player 2', connectionId: 'other-conn', score: 100 }
          ],
          ownerId: 'test-conn-123'
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.locator('[data-screen-label="04 Results"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: /takes the crown/i })).toBeVisible();
    await expect(page.getByText('150 pts')).toBeVisible();
    await expect(page.getByText('100 pts')).toBeVisible();
  });

  test('should show play again and back to lobby buttons', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameEnded',
        game: {
          gameId: 'ABC123',
          gameState: 'ENDED',
          players: [
            { name: 'Player 1', connectionId: 'test-conn-123', score: 150 }
          ],
          ownerId: 'test-conn-123'
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('button', { name: /Play Again/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Back to Lobby/i })).toBeVisible();
  });

  test('should return to lobby when back button clicked', async ({ page }) => {
    await mockApi(page, {
      createGame: {
        action: 'gameEnded',
        game: {
          gameId: 'ABC123',
          gameState: 'ENDED',
          players: [
            { name: 'Player 1', connectionId: 'test-conn-123', score: 150 }
          ],
          ownerId: 'test-conn-123'
        }
      }
    });

    await page.goto('/');
    await expectConnected(page);
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('button', { name: /Back to Lobby/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Back to Lobby/i }).click();

    // Should be back at lobby
    await expect(page.getByRole('button', { name: 'Create New Game' })).toBeVisible();
  });
});
