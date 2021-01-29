import _debug from 'debug';
const debug = _debug('app:init');
import 'isomorphic-fetch';
import config from './config';
import { init as jaysonClientInit } from './utils/jaysonClient';
import { msgProcessor } from './mw';
import { createMqReceiver, createMqTransmitter } from './utils/amq';

export default async function init() {
  let mqiot = config.mqiot;
  if (!mqiot) {
    throw new Error('cfg: no config.mq!');
  }

  debug('初始化依赖的微服务');
  jaysonClientInit(config.ms);

  debug('创建MQ接收器,接收来自topic_iot的msg.dataReport消息');
  await createMqReceiver({
    url: mqiot.url,
    exchange: mqiot.exchange,
    key: mqiot.key_consumer,
    processor: msgProcessor
  });

  debug('测试消息处理过程');
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
