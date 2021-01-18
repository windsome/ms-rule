import _debug from 'debug';
const debug = _debug('app:jrpcserver');
import 'isomorphic-fetch';
import { EM } from './Errcode';
import { default as ops } from './mw';

function wrapOps() {
  let result = {};
  let names = Object.getOwnPropertyNames(ops);
  for (let i = 0; i < names.length; i++) {
    let name = names[i];
    let func = ops[name];
    result[name] = async function(args) {
      try {
        debug(`run ${name}:`, args);
        return await func(...args);
      } catch (e) {
        let errcode = e.errcode || -1;
        let message = EM[errcode] || e.message || '未知错误';
        let xOrigMsg = e.xOrigMsg || e.message;
        console.error(e);
        return { errcode, message, xOrigMsg };
      }
    };
  }
  return result;
}

// 创建services
export default function createService() {
  return wrapOps();
}
