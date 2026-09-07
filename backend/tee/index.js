const { createTeeClient } = require('./client');
const { registerTeeRoutes } = require('./routes');

module.exports = { createTeeClient, registerTeeRoutes, ...require('./constants') };
