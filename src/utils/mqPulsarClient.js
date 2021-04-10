import _debug from 'debug';
const debug = _debug('app:utils:mqPulsarClient');
const Pulsar = require('pulsar-client');

/**
 * pulsar client配置信息:
opts = {
  serviceUrl: 'pulsar+ssl://msgpush.ctwing.cn:16651',
  token:
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyMDAwMDE2NDI1In0.qPFfczP_uH02462LoGOs68jeZ53Qt_AelagEyVN2JXs',
};
consume相关信息:
{
  topic: 'aep-msgpush/2000016425/topic_test',
  subscription: 'my-subscription',
  subscriptionType: 'Exclusive',
}
 */

export function createClient(serviceUrl, token) {
  return new Pulsar.Client({
    operationTimeoutSeconds: 30,
    serviceUrl: serviceUrl,
    authentication: new Pulsar.AuthenticationToken({ token })
  });
}

export async function consume(client, topic, opts) {
  if (!client) {
    throw new Error('no client!');
  }
  if (!topic) {
    throw new Error('no topic!');
  }
  let { subscription, subscriptionType, processor } = opts || {};
  if (!processor) {
    throw new Error('no processor!');
  }
  if (!subscription) subscription = 'my-subscription';
  if (!subscriptionType) subscriptionType = 'Exclusive';

  let consumer = null;
  try {
    // Create a consumer
    consumer = await client.subscribe({
      topic,
      subscription,
      subscriptionType
    });
  } catch (error) {
    debug('client.subscribe fail! retry! ', error);
    consumer = await client.subscribe({
      topic,
      subscription,
      subscriptionType
    });
  }

  // Receive messages
  let msgCount = 0;
  while (true) {
    let msg = null;
    try {
      msg = await consumer.receive();
    } catch (error) {
      debug('error receive!', error);
      break;
    }
    let dataRetrieve = msg.getData().toString();
    debug(`consumer[${msgCount}] dataRetrieve: ${dataRetrieve}`);
    let result = null;
    try {
      dataRetrieve = JSON.parse(dataRetrieve);
      if (processor) {
        result = await processor(dataRetrieve);
      }
    } catch (error) {
      debug(`consumer[${msgCount}] error!`, error);
    }
    debug(`+consumer[${msgCount}] done!`);
    msgCount++;
    consumer.acknowledge(msg);
  }
  await consumer.close();
}

export async function produce(client, topic, message) {
  if (!client) {
    throw new Error('no client!');
  }
  if (!topic) {
    throw new Error('no topic!');
  }
  if (!message) {
    throw new Error('no message!');
  }

  // Create a producer
  const producer = await client.createProducer({
    topic
  });

  // Send messages
  await producer.send({
    data: Buffer.from(JSON.stringify(message))
  });
  // await producer.flush();

  await producer.close();
  return true;
}

export default class Client {
  /**
   * 构造函数
opts = {
  serviceUrl: 'pulsar+ssl://msgpush.ctwing.cn:16651',
  token:
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyMDAwMDE2NDI1In0.qPFfczP_uH02462LoGOs68jeZ53Qt_AelagEyVN2JXs',
};
   */
  constructor(opts) {
    this.opts = opts;
    this.client = new Pulsar.Client({
      operationTimeoutSeconds: 30,
      serviceUrl: opts.serviceUrl,
      authentication: new Pulsar.AuthenticationToken({ token: opts.token })
    });
  }

  async consume(topic, opts) {
    if (!this.client) {
      throw new Error('no this.client!');
    }
    if (!topic) {
      throw new Error('no topic!');
    }
    let { subscription, subscriptionType, processor } = opts || {};
    if (!processor) {
      throw new Error('no processor!');
    }
    if (!subscription) subscription = 'my-subscription';
    if (!subscriptionType) subscriptionType = 'Exclusive';

    let consumer = null;
    try {
      // Create a consumer
      consumer = await this.client.subscribe({
        topic,
        subscription,
        subscriptionType
      });
    } catch (error) {
      debug('client.subscribe fail! retry! ', error);
      consumer = await this.client.subscribe({
        topic,
        subscription,
        subscriptionType
      });
    }

    // Receive messages
    let msgCount = 0;
    while (true) {
      let msg = null;
      try {
        msg = await consumer.receive();
      } catch (error) {
        debug('error receive!', error);
        break;
      }
      let dataRetrieve = msg.getData().toString();
      debug(`consumer[${msgCount}] dataRetrieve: ${dataRetrieve}`);
      let result = null;
      try {
        // dataRetrieve = JSON.parse(dataRetrieve);
        if (processor) {
          result = await processor(dataRetrieve);
        }
      } catch (error) {
        debug(`consumer[${msgCount}] error!`, error);
      }
      debug(`+consumer[${msgCount}] done!`);
      msgCount++;
      consumer.acknowledge(msg);
    }
    await consumer.close();
  }

  async produce(topic, message) {
    if (!this.client) {
      throw new Error('no this.client!');
    }
    if (!topic) {
      throw new Error('no topic!');
    }
    if (!message) {
      throw new Error('no message!');
    }

    // Create a producer
    const producer = await this.client.createProducer({
      topic
    });

    // Send messages
    await producer.send({
      data: Buffer.from(JSON.stringify(message))
    });
    // await producer.flush();

    await producer.close();
    return true;
  }
}
