/**
 * websocket服务器.(再三考虑后,认为此服务器不处理认证授权,去掉authed_connections)
 * 对连接上的客户端进行鉴权,管理.
 * 服务器初始化后,定时更新本服务器在redis中键值,以确保让其他服务器知道本服务器状态.
 * WSSERVERS_in_redis: { // 超时时间为5分钟,定时1分钟更新过期时间.
 *   SVR##[WSSERVER_UUID1]:last_refresh_time // 保存最后更新时间.
 *   SVR##[WSSERVER_UUID2]:last_refresh_time
 * }
 * 临时websocket管理(未经过授权认证的websocket管理,此刻还未认证,不知道user_id,一旦认证则从其中移走).
 * client_connections = {
 *   [client_ip1]##[client_port1]: {ip:client_ip1, port:client_port1, ws[, userId:user_id1, token]},
 *   [client_ip2]##[client_port2]: {ip:client_ip2, port:client_port2, ws[, userId:user_id2, token]},
 * }
 * 授权后的连接列表,redis中客户端数据结构(消息处理服务器和本服务器(websocket服务器)通过redis中此键达成无状态服务器)
 * authed_connections_in_redis: {
 *   UC##[user_id1]##[WSSERVER_UUID1]##[client_ip1]##[client_port1]: [WSSERVER_UUID1],
 *   UC##[user_id2]##[WSSERVER_UUID2]##[client_ip2]##[client_port2]: [WSSERVER_UUID2],
 *   UC##[user_id3]##[WSSERVER_UUID3]##[client_ip3]##[client_port3]: [WSSERVER_UUID3],
 *   UC##[user_id4]##[WSSERVER_UUID1]##[client_ip4]##[client_port4]: [WSSERVER_UUID1],
 * }
 * 系统消息:
 * 1. websocket服务器心跳消息保活,用于延迟SVR*有效期.
 * {
 *  type: '_svr_heatbeat',
 *  _sys: {
 *    serverId: [WSSERVER_UUID1]
 *    clients: [{ip1,port1},{ip2,port2}] //客户端连接数组,也需要心跳保活
 *  }
 * }
 * 2. websocket服务器断开连接.
 * {
 *  type: '_svr_close',
 *  _sys: {
 *    serverId: [WSSERVER_UUID1]
 *  }
 * }
 * 3. websocket客户端连接关闭消息
 * {
 *  type: '_connection_close',
 *  _sys: {
 *    ip: '客户端IP',
 *    port: '客户端端口',
 *    serverId: [WSSERVER_UUID1]
 *  }
 * }
 * 业务消息:
 * 1. 鉴权/登录消息:
 * {
 *  type:'auth'
 *  token, // token用来鉴权
 *  _sys: {
 *    ip: '客户端IP',
 *    port: '客户端端口',
 *    serverId: [WSSERVER_UUID1]
 *  }
 * }
 * 2. 登出消息:
 * {
 *  type:'logout'
 *  _sys: {
 *    ip: '客户端IP',
 *    port: '客户端端口',
 *    serverId: [WSSERVER_UUID1]
 *  }
 * }
 * 其他消息: //不必再带token,user,会自动将之前认证的userId填入消息体中.
 * {
 *  ...
 * }
 */
import { v4 as uuidv4 } from 'uuid';
import sleep from '../../utils/sleep';
import _debug from 'debug';
const debug = _debug('app:ws:createServer');
const WebSocket = require('ws');

let MQ_SVR_KEY = 'im.processor';
let client_connections = {}; // 见上面描述
// let authed_connections = {}; // 将上面描述
let bServerHeatbeat = true; // 服务器心跳,每隔一分钟执行一次.

/**
 * 创建websocket服务器
 * @param {json} opts {port:服务器端口,processor:消息处理函数,将消息发送到MQ}
 */
export function createServer(opts = { port: 8080, processor: null }) {
  let { port, processor } = opts;
  const server = new WebSocket.Server({ port });
  let serverId = uuidv4().replace(/-/g, ''); // 去掉'-'的uuid字符串
  debug('about to create websocket_server uuid=' + serverId);

  serverHeatbeat({ serverId, processor });
  server.on('open', () => {
    debug('ok! websocket_server openend! uuid=', serverId);
  });

  server.on('close', async () => await handleServerClose(serverId));
  server.on('error', error => {
    debug('error! websocket_server uuid=' + serverId, error);
  });

  server.on('connection', (ws, req) =>
    handleNewClientConnection(ws, req, {
      server,
      serverId,
      processor
    })
  );
  return serverId;
}

async function serverHeatbeat(opts) {
  let { serverId, processor } = opts;
  while (bServerHeatbeat) {
    let clients = [];
    let keys = Object.getOwnPropertyNames(client_connections);
    for (let i = 0; i < keys.length; i++) {
      let client_key = keys[i];
      let client = client_connections[client_key];
      clients.push({ ip: client.ip, port: client.port });
    }
    await processor(
      { type: '_svr_heartbeat', _sys: { serverId, clients } },
      MQ_SVR_KEY
    );
    await sleep(20 * 1000); // 每隔1分钟刷新.
  }
}

async function handleServerClose(opts) {
  bServerHeatbeat = false;
  let { serverId, processor } = opts;
  debug('websocket_server closed! uuid=' + serverId);
  await processor({ type: '_svr_close', _sys: { serverId } }, MQ_SVR_KEY);
  // 清空connections
  client_connections = {};
}

function handleNewClientConnection(ws, req, opts) {
  let { server, serverId, processor } = opts;
  const ip = req.connection.remoteAddress;
  const port = req.connection.remotePort;
  const clientName = ip + '##' + port;

  debug('new client is arrive and connect!', clientName);
  ws.on(
    'close',
    async () => await handleClientClose({ ip, port, serverId, processor })
  );
  ws.on('error', error => handleClientError({ ip, port, error }));

  // 设置事件
  ['open', 'ping', 'pong', 'unexpected-response', 'upgrade'].map(it => {
    ws.on(it, function() {
      debug(it + ':', arguments);
    });
  });

  // 发送欢迎信息给客户端
  // ws.send('Welcome ' + clientName);

  ws.on('message', message =>
    handleClientMessage(message, {
      server,
      ws,
      serverId,
      ip,
      port,
      processor
    })
  );

  // 保存到connections中等待认证后更新到user_connections_in_memory中.
  client_connections[clientName] = { ip, port, ws, serverId };
}

/**
 * 处理客户端关闭事件.
 * @param {json} opts {ws: 客户端websocket, serverId: 服务器id, ip: 客户端ip, port: 客户端端口}
 */
async function handleClientClose(opts) {
  let { ip, port, serverId, processor } = opts;
  // 删除与登录有关内存键值及redis中键值.
  await processor(
    { type: '_connection_close', _sys: { serverId, ip, port } },
    MQ_SVR_KEY
  );
  // 从client_connections中删除相关键.
  delete client_connections[`${ip}##${port}`];
}

/**
 * 处理客户端错误事件.
 * @param {json} opts {ws: 客户端websocket, serverId: 服务器id, ip: 客户端ip, port: 客户端端口}
 */
function handleClientError(opts) {
  debug('handleClientError', opts.ip, opts.port, opts.error);
}

/**
 * 处理客户端的消息.
 * 解析消息,得到消息类型.如果是auth,则去认证.
 * 如果是其他消息,则首先获取token,判断是否已经授权(判断是否在user_connections_in_memory中),未授权则返回未授权错误(是否关闭ws?).
 * 如果已授权,则将消息推送到消息队列,由消息处理服务进行处理.
 * @param {string} strMsg 消息内容
 * @param {json} opts {ws: 客户端websocket, serverId: 服务器id, ip: 客户端ip, port: 客户端端口}
 */
async function handleClientMessage(message, opts) {
  let { ip, port, ws, serverId, processor } = opts;
  debug('handleClientMessage', message, JSON.stringify({ ip, port, serverId }));
  let msg = null;
  try {
    msg = JSON.parse(message);
  } catch (error) {
    debug('error!', message, { ip, port, serverId }, error);
    return false;
  }
  let result = null;
  switch (msg.type) {
    case 'heatbeat':
      result = ws.send(
        JSON.stringify({ type: 'heatbeat_reply', time: new Date() })
      );
      break;
    default: {
      // 其他消息可以直接推送到消息处理服务器.
      // auth, logout, //登录注销
      // session_create, session_add_user, session_remove_user, session_exit,
      // msg_send, msg_recv, msg_cancel, msg_accept, msg_refuse, msg_editing
      result = await processor(
        { ...msg, _sys: { serverId, ip, port } },
        MQ_SVR_KEY
      );
      break;
    }
  }
  debug('+handleClientMessage', result);
  return result;

  // // 广播消息给所有客户端
  // opts.server.clients.forEach(function each(client) {
  //   if (client.readyState === WebSocket.OPEN) {
  //     client.send( clientName + " -> " + message);
  //   }
  // });
}

export function sendClientMessage(message) {
  let strmsg = message.content.toString();
  debug('sendClientMessage Received:', strmsg);
  let msgobj = null;
  try {
    msgobj = JSON.parse(strmsg);
  } catch (error) {
    debug('error JSON.parse() message!');
    return false;
  }
  let { _sys, ...msg } = msgobj;
  let { ip, port } = _sys || {};
  if (!ip || !port) {
    debug('error! no ip or port!');
    return false;
  }

  let client_connection = client_connections[`${ip}##${port}`];
  let ws = client_connection && client_connection.ws;
  if (!ws) {
    debug('error! ws is null!', { ip, port });
    return false;
  }
  strmsg = JSON.stringify(msg);
  ws.send(strmsg);
  debug('+sendClientMessage ok!');
  return true;
}
