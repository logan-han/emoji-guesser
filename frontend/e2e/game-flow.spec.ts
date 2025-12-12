import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for game flows using mock WebSocket.
 * These tests verify the UI behavior without requiring a real backend.
 */

// Helper to inject mock WebSocket responses into the page
async function injectMockWebSocket(page: Page, responses: Record<string, any>) {
  await page.addInitScript((responsesJson) => {
    const responses = JSON.parse(responsesJson);

    class MockWebSocket {
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = 1; // WebSocket.OPEN
      url = '';

      constructor(url: string) {
        this.url = url;
        setTimeout(() => {
          if (this.onopen) {
            this.onopen(new Event('open'));
          }
          // Send connected message
          if (this.onmessage) {
            this.onmessage(new MessageEvent('message', {
              data: JSON.stringify({ action: 'connected', connectionId: 'test-conn-123' })
            }));
          }
        }, 100);
      }

      send(data: string) {
        const message = JSON.parse(data);
        const action = message.action;

        if (responses[action] && this.onmessage) {
          setTimeout(() => {
            this.onmessage!(new MessageEvent('message', {
              data: JSON.stringify(responses[action])
            }));
          }, 50);
        }
      }

      close() {
        if (this.onclose) {
          this.onclose(new CloseEvent('close'));
        }
      }
    }

    (window as any).WebSocket = MockWebSocket;
  }, JSON.stringify(responses));
}

test.describe('Game Creation Flow', () => {
  test('should create a new game and show lobby', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });

    // Click create game
    await page.getByRole('button', { name: 'Create New Game' }).click();

    // Should show game lobby
    await expect(page.getByRole('heading', { name: /Game Lobby/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ABC123')).toBeVisible();
    await expect(page.getByText(/Invite Link/)).toBeVisible();
  });

  test('should show game settings for owner', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('heading', { name: /Game Settings/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Round Time Limit/)).toBeVisible();
    await expect(page.getByText(/Rounds/)).toBeVisible();
  });
});

test.describe('Game Lobby', () => {
  test('should display player list', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('heading', { name: /Players/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Player 1')).toBeVisible();
  });

  test('should copy invite link to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByText(/Invite Link/)).toBeVisible({ timeout: 5000 });

    // Click copy button
    await page.getByRole('button', { name: /Copy/i }).click();

    // Should show copied feedback
    await expect(page.getByText(/Copied/i)).toBeVisible();
  });

  test('should allow editing player name', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    // Click to edit name
    await expect(page.getByText(/click to edit/)).toBeVisible({ timeout: 5000 });
    await page.getByText(/click to edit/).click();

    // Input should appear
    const nameInput = page.getByPlaceholder('Enter your name (required)');
    await expect(nameInput).toBeVisible();
  });
});

test.describe('Game In Progress', () => {
  test('should display game in progress view', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByText(/Game in Progress/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Scoreboard/)).toBeVisible();
  });

  test('should show word choosing view for describer', async ({ page }) => {
    // First inject game creation, then word choice
    await page.addInitScript(() => {
      let messageCount = 0;

      class MockWebSocket {
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        readyState = 1;
        url = '';

        constructor(url: string) {
          this.url = url;
          setTimeout(() => {
            if (this.onopen) {
              this.onopen(new Event('open'));
            }
            if (this.onmessage) {
              this.onmessage(new MessageEvent('message', {
                data: JSON.stringify({ action: 'connected', connectionId: 'test-conn-123' })
              }));
            }
          }, 100);
        }

        send(data: string) {
          const message = JSON.parse(data);

          if (message.action === 'createGame') {
            setTimeout(() => {
              // First send game started
              this.onmessage!(new MessageEvent('message', {
                data: JSON.stringify({
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
                })
              }));

              // Then send choose word
              setTimeout(() => {
                this.onmessage!(new MessageEvent('message', {
                  data: JSON.stringify({
                    action: 'chooseWord',
                    wordOptions: ['elephant', 'pizza', 'bicycle']
                  })
                }));
              }, 50);
            }, 50);
          }
        }

        close() {}
      }

      (window as any).WebSocket = MockWebSocket;
    });

    await page.goto('/');
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByText(/Choose a Word to Describe/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'elephant' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'pizza' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'bicycle' })).toBeVisible();
  });

  test('should show guess input for non-describer', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByPlaceholder('Type your guess...')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Guess' })).toBeVisible();
  });
});

test.describe('Game End', () => {
  test('should display game ended view with scores', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByText(/Game Ended/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Final Scores/)).toBeVisible();
    await expect(page.getByText('150')).toBeVisible();
    await expect(page.getByText('100')).toBeVisible();
  });

  test('should show play again and back to lobby buttons', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('button', { name: /Play Again/i })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Back to Lobby/i })).toBeVisible();
  });

  test('should return to lobby when back button clicked', async ({ page }) => {
    await injectMockWebSocket(page, {
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
    await expect(page.getByText(/Connected/)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Create New Game' }).click();

    await expect(page.getByRole('button', { name: /Back to Lobby/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Back to Lobby/i }).click();

    // Should be back at lobby
    await expect(page.getByRole('button', { name: 'Create New Game' })).toBeVisible();
  });
});
