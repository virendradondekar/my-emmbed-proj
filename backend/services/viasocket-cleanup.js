function isExpectedCleanupError(error) {
  const message = String(error?.message || error || '');
  return /(status is already set to this value|failed to delete authentication data|already (disabled|revoked|removed|deleted)|is already.*(disabled|revoked)|not active|no action required|does not exist|not found)/i.test(message);
}

async function safeViaSocketCleanup({ disableFlow, revokeConnection, shouldDisable, shouldRevoke }) {
  if (shouldDisable && typeof disableFlow === 'function') {
    try {
      await disableFlow();
    } catch (error) {
      if (!isExpectedCleanupError(error)) throw error;
    }
  }

  if (shouldRevoke && typeof revokeConnection === 'function') {
    try {
      await revokeConnection();
    } catch (error) {
      if (!isExpectedCleanupError(error)) throw error;
    }
  }
}

module.exports = {
  isExpectedCleanupError,
  safeViaSocketCleanup,
};
