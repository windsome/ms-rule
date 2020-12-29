///////////////////////////////////////////////////
// jayson micro service server.
// 见: <https://github.com/tedeh/jayson/blob/master/examples/promise/server.js>
///////////////////////////////////////////////////
require('babel-register');
const jayson = require('jayson/promise');
const createService = require('./mainserver').default;
let config = require('./config').default;
let _debug = require('debug');
const debug = _debug('app:index');

const port = config.server_port || 3000;
const server = jayson.server(createService());

debug(`Server accessible via tcp://localhost:${port} `);
server.tcp().listen(port);
