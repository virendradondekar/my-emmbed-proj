import { connect, loadConnectScript } from '/vendor/viasocket-apps/browser.js';

// Load the small consent popup script before the user clicks Connect Gmail.
// This is the ViaSocket SDK's browser helper; it does not mount the full UI.
window.viaSocketConnectReady = loadConnectScript().catch(error => {
  console.error('ViaSocket connect script could not load:', error.message);
  return null;
});
window.viaSocketConnectGmail = connect;
