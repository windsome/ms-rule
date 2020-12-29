import amqp from 'amqplib';
import _debug from 'debug';
const debug = _debug('app:mq:transmitter');

export function createMqTransmitter(
  opts = { url: 'localhost', exchange: 'topic_im' }
) {
  let conn_channel = null;

  /**
   * 创建发送器,发往MQ.
   * @param {json} opts
   */
  async function createConnChannel(
    opts = { url: 'localhost', exchange: 'topic_im' }
  ) {
    let { url, exchange } = opts;
    let conn = await amqp.connect(url);
    conn.on('close', async () => {
      debug('event close! need restart after 10 sencods?');
      conn_channel = null;
    });
    let channel = await conn.createChannel();
    channel.assertExchange(exchange, 'topic', {
      durable: false
    });
    return { conn, channel };
  }

  /**
   * 发送msg到key
   * key为'im.processor','im.transceiver.[serverId]'
   */
  return async function send(msg, key) {
    if (!conn_channel) {
      conn_channel = await createConnChannel(opts);
    }
    let strMsg = JSON.stringify(msg);
    let result = await conn_channel.channel.publish(
      opts.exchange,
      key,
      Buffer.from(strMsg)
    );
    debug('send:', opts, msg, result);
    return true;
  };
}
