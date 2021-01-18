import _debug from 'debug';
const debug = _debug('app:init');
import 'isomorphic-fetch';
import config from './config';
import { init as jaysonClientInit } from './utils/jaysonClient';
import {
  createServer as createWebsocketServer,
  createMqTransmitter,
  createMqReceiver,
  sendClientMessage
} from './mw';

export default async function init() {
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

  debug('初始化完成');
}
