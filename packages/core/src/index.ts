// Public surface of @trove/core: build or serve the review server, probe a path for git, call a
// running server, and the selftest the CLI runs.
export * from './types.js';
export { createApp, serve, call, type App, type AppOptions } from './app.js';
export { probeGit } from './source.js';
export { kindOf, enabledTypes } from './settings.js';
export { selftest } from './selftest.js';
