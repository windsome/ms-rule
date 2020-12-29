/**
 * websocket收发服务器,接收来自processor的消息,通过websocket发送给客户端.
 * 监听 im.transceiver.<serverid>
 */
import amqp from 'amqplib';
import sleep from '../../utils/sleep';
import _debug from 'debug';
const debug = _debug('app:mq:receiver');

async function createConsumer(
  opts = {
    url: 'localhost',
    exchange: 'topic_im',
    key: 'im.processor',
    processor: null
  }
) {
  try {
    let { url, exchange, key, processor } = opts;
    if (!url || !exchange || !key || !processor) {
      debug('error params!', opts);
      return false;
    }
    debug('start init', opts);
    let conn = await amqp.connect(url);
    conn.on('close', async () => {
      debug('event close! need restart after 10 sencods?');
      await sleep(10 * 1000);
      return await createConsumer(opts);
    });
    let channel = await conn.createChannel();
    await channel.assertExchange(exchange, 'topic', {
      durable: false
    });
    let queue = await channel.assertQueue('', {
      exclusive: true
    });
    await channel.bindQueue(queue.queue, exchange, key);
    let consumer = await channel.consume(queue.queue, processor, {
      noAck: true
    });
    debug('consumer', consumer);
    return {
      conn,
      channel,
      consumer
    };
  } catch (error) {
    debug('error!', error);
    return false;
  }
}

export async function createMqReceiver(opts) {
  let conn_channel_consumer = null;

  conn_channel_consumer = await createConsumer(opts);
  if (!conn_channel_consumer) {
    await sleep(10 * 1000);
    return await createConsumer(opts);
  }
  return conn_channel_consumer;
}

// /**
//  * 将处理后的消息通过websocket发送给客户.
//  * 注意msg中的ws为{userId, ip, port}用来指定是那个websocket.
//  * @param {binary} message
//  */
// async function processMessage(message) {
//   let strmsg = message.content.toString();
//   debug('Received %s', strmsg);
//   let { ws, ...msg } = JSON.parse(strmsg);
//   return sendClientMessage(ws.userId, ws.ip, ws.port, msg);
// }
