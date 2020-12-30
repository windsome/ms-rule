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
  let wscfg = config.websocket;
  if (!wscfg) {
    throw new Error('cfg: no config.websocket!');
  }
  let mqcfg = config.mq;
  if (!mqcfg) {
    throw new Error('cfg: no config.mq!');
  }

  debug('初始化依赖的微服务');
  jaysonClientInit(config.ms);

  debug('初始化MQ发送器,用来将消息发往ms-ctwing服务');
  let sender = createMqTransmitter({
    url: mqcfg.url,
    exchange: mqcfg.exchange
  }); // 得到发送往MQ的发送器.
  debug('初始化websocket服务器');
  let serverId = createWebsocketServer({ ...wscfg, processor: sender });
  debug(
    '创建MQ接收器,接收来自业务处理服务器发送过来的消息,通过websocket发送给客户端'
  );
  createMqReceiver({
    url: mqcfg.url,
    exchange: mqcfg.exchange,
    key: 'im.wsserver.' + serverId,
    processor: sendClientMessage
  });

  return wrapOps();
}
