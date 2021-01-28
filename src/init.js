import _debug from 'debug';
const debug = _debug('app:init');
import 'isomorphic-fetch';
import config from './config';
import { init as jaysonClientInit } from './utils/jaysonClient';
import { msgProcessor } from './mw';
import { createMqReceiver, createMqTransmitter } from './utils/amq';

export default async function init() {
  // let wscfg = config.websocket;
  // if (!wscfg) {
  //   throw new Error('cfg: no config.websocket!');
  // }
  let mqcfg = config.mq;
  if (!mqcfg) {
    throw new Error('cfg: no config.mq!');
  }

  debug('初始化依赖的微服务');
  jaysonClientInit(config.ms);

  // debug('初始化MQ发送器,用来将消息发往ms-ctwing服务');
  // let sender = createMqTransmitter({
  //   url: mqcfg.url,
  //   exchange: mqcfg.exchange
  // }); // 得到发送往MQ的发送器.
  // debug('初始化websocket服务器');
  // let serverId = createWebsocketServer({ ...wscfg, processor: sender });
  debug(
    '创建MQ接收器,接收来自业务处理服务器发送过来的消息,通过websocket发送给客户端'
  );
  await createMqReceiver({
    url: mqcfg.url,
    exchange: mqcfg.exchange,
    key: mqcfg.key_consumer,
    processor: msgProcessor
  });

  await msgProcessor(
    JSON.stringify({
      _id: '5ffd331a2222222222000001',
      payload: {
        timestamp: 1611736597,
        switch_1: true
      }
    })
  );
  debug('初始化完成');
}
