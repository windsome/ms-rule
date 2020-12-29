import _debug from 'debug';
const debug = _debug('app:ws:_jwt');
const jwt = require('jsonwebtoken');
const secret = 'mysecretforsharkstv';

/**
 * 内部使用,没有ctx,next
 * @param {string} token
 */
export function tokenVerifyThin(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, {}, (error, decoded) => {
      error ? reject(error) : resolve(decoded);
    });
  });
}
