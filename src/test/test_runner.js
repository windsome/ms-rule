require('babel-register');

let argv = process.argv;
let opt = argv[2];
let main = null;
console.log('opt', opt);
switch (opt) {
  case 'wxmp':
    main = require('./test_rpcs_wxmp').default;
    break;
  case 'usercenter':
  default:
    main = require('./test_rpcs_usercenter').default;
    break;
}
main();
