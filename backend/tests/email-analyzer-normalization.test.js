const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeAttachmentDetails } = require('../services/email-analyzer');

test('normalize attachment metadata when webhook supplies a single object', () => {
  const normalized = normalizeAttachmentDetails({ filename: 'invoice.pdf', mimeType: 'application/pdf' });
  assert.deepEqual(normalized, [{ filename: 'invoice.pdf', mimeType: 'application/pdf' }]);
});
