let init = require('../utils/jaysonClient').init;
let $rpc = require('../utils/jaysonClient').$rpc;
let config = require('../config').default;
const port = config.server_port || 3000;

export default async function main() {
  init(config.ms);
  let ret = await $rpc('wxmp').getAuthorizeURL('http://m.h5ren.com/a');
  console.log('getAuthorizeURL:', ret);
}
