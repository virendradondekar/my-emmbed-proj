const test = require('node:test');
const assert = require('node:assert/strict');

const { isExpectedCleanupError, safeViaSocketCleanup } = require('../services/viasocket-cleanup');

test('treats already-disabled status as a harmless cleanup result', () => {
  const err = new Error('Status is already set to this value');
  assert.equal(isExpectedCleanupError(err), true);
});

test('treats auth deletion no-op responses as harmless cleanup results', () => {
  const err = new Error('Failed to delete authentication data');
  assert.equal(isExpectedCleanupError(err), true);
});

test('ignores harmless cleanup errors while still surfacing real failures', async () => {
  let disableCalled = 0;
  let revokeCalled = 0;

  const flow = { disable: async () => { disableCalled += 1; throw new Error('Status is already set to this value'); }, revoke: async () => { revokeCalled += 1; throw new Error('Connection is already revoked'); } };

  await safeViaSocketCleanup({
    disableFlow: flow.disable,
    revokeConnection: flow.revoke,
    shouldDisable: true,
    shouldRevoke: true,
  });

  assert.equal(disableCalled, 1);
  assert.equal(revokeCalled, 1);
});

test('rethrows unexpected cleanup errors', async () => {
  await assert.rejects(
    () => safeViaSocketCleanup({
      disableFlow: async () => { throw new Error('network timeout'); },
      revokeConnection: async () => {},
      shouldDisable: true,
      shouldRevoke: false,
    }),
    /network timeout/
  );
});
