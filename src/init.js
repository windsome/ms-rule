import _debug from 'debug';
const debug = _debug('app:init');
import 'isomorphic-fetch';
import config from './config';
import { init as jaysonClientInit } from './utils/jaysonClient';
import { msgProcessor } from './mw';
// import { createMqReceiver, createMqTransmitter } from './utils/amq';
import PulsarMq from './utils/mqPulsarClient';

export default async function init() {
  debug('初始化依赖的微服务');
  jaysonClientInit(config.ms);

  debug('初始化platmq接收器');
  if (!config.platmq) {
    throw new Error('cfg: no config.platmq!');
  }
  let mqPulsarPlat = new PulsarMq(config.platmq);
  mqPulsarPlat
    .consume(config.platmq.topic, {
      processor: msgProcessor
    })
    .catch(error => {
      debug('error2! 出错退出重启!', error);
      process.exit(-1);
    });

  // debug('创建MQ接收器,接收来自topic_iot的msg.dataReport消息');
  // let mqiot = config.mqiot;
  // if (!mqiot) {
  //   throw new Error('cfg: no config.mq!');
  // }
  // await createMqReceiver({
  //   url: mqiot.url,
  //   exchange: mqiot.exchange,
  //   key: mqiot.key_consumer,
  //   processor: msgProcessor
  // });

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
