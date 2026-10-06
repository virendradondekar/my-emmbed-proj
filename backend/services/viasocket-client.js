const { ViaSocket } = require('viasocket-apps');

const viasocket = new ViaSocket({
  orgId: process.env.VIASOCKET_ORG_ID,
  projectId: process.env.VIASOCKET_PROJECT_ID,
  secret: process.env.VIASOCKET_EMBED_SECRET,
  apiBaseUrl: process.env.VIASOCKET_API_URL || 'https://flow-api.viasocket.com',
  runBaseUrl: process.env.VIASOCKET_RUN_URL || 'https://flow.sokt.io'
});

function viasocketUser(uniqueIdentifier) {
  return viasocket.user(uniqueIdentifier);
}

module.exports = { viasocket, viasocketUser };
