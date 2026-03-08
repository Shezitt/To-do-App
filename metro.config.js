const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').ConfigT} */
const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

module.exports = config;