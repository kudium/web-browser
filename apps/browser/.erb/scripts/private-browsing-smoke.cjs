// Use the production browser renderer and backend; no separate private UI.
const { app } = require('electron');
process.on('uncaughtException', (error) => { console.error(error); app.exit(1); });
process.on('unhandledRejection', (error) => { console.error(error); app.exit(1); });
process.argv.push('--private-only');
require('./browser-ui-smoke.cjs');
