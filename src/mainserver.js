import _debug from 'debug';
const debug = _debug('app:mainserver');
import 'isomorphic-fetch';
import config from './config';
let packageJson = require('../package.json');
import { EM } from './Errcode';
import { initRedis } from './utils/redis';
import { default as ops } from './mw';
import { init as jaysonClientInit } from './utils/jaysonClient';
import {
  createServer as createWebsocketServer,
  createMqTransmitter,
  createMqReceiver,
  sendClientMessage
} from './mw';

debug('SOFTWARE VERSION:', packageJson.name, packageJson.version);
debug('CONFIG NAME:', config.name);

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
        console.error(e);
        return { errcode, message, xOrigMsg: e.message };
      }
    };
  }
  return result;
}

// 创建services
export default function createService() {
  let redisUrl = config.redis && config.redis.url;
  if (!redisUrl) {
    throw new Error('cfg: no redis.url!');
  }
  let port = config.websocket && config.websocket.port;
  if (!port) {
    throw new Error('cfg: no websocket.port!');
  }
  let mqcfg = config.mq;
  if (!mqcfg) {
    throw new Error('cfg: no config.mq!');
  }

  // 初始化redis, 供smscode, wxmpState缓存使用
  initRedis(redisUrl);
  // 初始化依赖的微服务 ms-wxmp
  jaysonClientInit(config.ms);

  let sender = createMqTransmitter({
    url: mqcfg.url,
    exchange: mqcfg.exchange
  }); // 得到发送往MQ的发送器.
  let serverId = createWebsocketServer({ port, processor: sender });
  createMqReceiver({
    url: mqcfg.url,
    exchange: mqcfg.exchange,
    key: 'im.transceiver.' + serverId,
    processor: sendClientMessage
  });

  return wrapOps();
}
