const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web loads a wasm build of SQLite.
config.resolver.assetExts.push('wasm');

// expo-sqlite on web needs SharedArrayBuffer, which requires cross-origin isolation.
// Patched at the http level because Expo serves the HTML before `enhanceMiddleware` runs.
const originalWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...args) {
  this.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  this.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return originalWriteHead.apply(this, args);
};

module.exports = config;
