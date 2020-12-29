/**
 * websocket服务器.
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
 * 授权后的连接列表,根据用户id进行分组(1个用户不同端登录会有不同连接):
 * authed_connections = {
 *   [user_id1]: [[client_ip1]##[client_port1],[client_ip2]##[client_port2], ...],
 *   [user_id2]: [[client_ip3]##[client_port3],[client_ip4]##[client_port4], ...],
 * }
 * redis中客户端数据结构(消息处理服务器和本服务器(websocket服务器)通过redis中此键达成无状态服务器)
 * authed_connections_in_redis: {
 *   UC##[user_id1]##[WSSERVER_UUID1]##[client_ip1]##[client_port1]: [WSSERVER_UUID1],
 *   UC##[user_id2]##[WSSERVER_UUID2]##[client_ip2]##[client_port2]: [WSSERVER_UUID2],
 *   UC##[user_id3]##[WSSERVER_UUID3]##[client_ip3]##[client_port3]: [WSSERVER_UUID3],
 *   UC##[user_id4]##[WSSERVER_UUID1]##[client_ip4]##[client_port4]: [WSSERVER_UUID1],
 * }
 * 鉴权/登录消息:
 * {
 *  type:'auth'
 *  token, // token用来鉴权
 * }
 * 登出消息:
 * {
 *  type:'logout'
 * }
 * 心跳消息(确保客户端连接活动):
 * {
 *  type: 'heatbeat'
 * }
 * 其他消息: //不必再带token,user,会自动将之前认证的userId填入消息体中.
 * {
 *  ...
 * }
 *
 * 如何做到无状态服务器(stateless).
 * websocket服务器是有状态的. 因为需要维护客户连接列表,每个连接为socket对象,连接需要保持,进行双向通信.
 * 但是,我们应用可能需要多个replicas同时运行以分担网络请求及任务处理压力.
 * 分析IM认证流程:
 * 1. websocket server启动,从redis中获取该server的编号,以后将监听发给本server的消息.
 * 2. websocket 客户端连接服务器
 * 3. 服务器端接收到客户端连接,将此连接connection保存在内存中,数据结构为 {[ip+port]:connection}
 * 4. 客户端发送认证请求{token,user}
 * 5. 服务器端接收到认证请求,做认证处理,失败返回认证失败的错误.成功则将connection保存进认证后的数据结构中user_connections_in_memory及user_connections_in_redis,并返回客户端认证成功消息auth_reply.
 * 分析IM消息流程:
 * 1. 服务器端在客户认证通过后,将存留的消息发送给该客户.(同步消息).
 * 2. 客户端发送消息到服务器,并指定某个session
 * 3. 服务器收到消息后,发送到消息队列.
 * 4. 消息处理服务器,从队列接收到一条消息,根据clientMsgId判断是否已经在messagerecv表中,不在则处理鉴黄鉴证后将该消息进messagerecv表.
 * 5. 根据该消息所在session,找到所有在此session中的人,生成发送消息列表,入messagesend表.
 * 6. 找到该session所有在线的人(注意:一个人可能有多个连接connection),将消息往所有这些人的connection推送,并将messagesend消息标记为发送中.
 * 7. websocket服务器接收到推往自己的消息,并根据connection_name挨个发送(message_send).
 * 8. websocket客户端收到消息,发送已收到命令(message_send_reply)给websocket服务器.
 * 9. websocket服务器收到message_send_reply后,将相应messagesend记录状态设置为已发送成功.
 * 分析IM客户端退出流程:
 * 1. 客户端直接断开websocket连接,服务器端会触发一个disconnect事件
 * 2. 服务器收到disconnect事件后,在user_connections_in_memory和user_connections_in_redis中去掉相应键值.
 * 分析IM收发服务器退出流程:
 * 1. server退出时会收到close事件.
 * 2. 清除user_connections_in_memory
 * 3. 清除user_connections_in_redis中该server对应的所有连接.
 * 分析消息处理流程:
 * 1. websocket收发服务器收到用户消息,发送到mq: im.processor 中,
 * 2. 消息处理服务器接收mq: im.processor 中消息,并处理.处理后的反馈消息需要发送到用户,首先发送到websocket收发服务器.
 * 3. websocket服务器监听mq: im.exchange.<serverid>
 */
import { v4 as uuidv4 } from 'uuid';
import forOwn from 'lodash/forOwn';
import without from 'lodash/without';
import uniq from 'lodash/uniq';
import $r from '../../utils/redis';
import sleep from '../../utils/sleep';
import { tokenVerifyThin } from './_jwt';
import _debug from 'debug';
const debug = _debug('app:ws:createServer');
const WebSocket = require('ws');

let client_connections = {}; // 见上面描述
let authed_connections = {}; // 将上面描述
let bServerHeatbeat = true; // 服务器心跳,每隔一分钟执行一次.

/**
 * 创建websocket服务器
 * @param {json} opts {port:服务器端口,processor:消息处理函数,将消息发送到MQ}
 */
export function createServer(opts = { port: 8080, processor: null }) {
  const server = new WebSocket.Server({ port: opts.port });
  let serverId = uuidv4().replace(/-/g, ''); // 去掉'-'的uuid字符串
  debug('about to create websocket_server uuid=' + serverId);

  serverHeatbeat(serverId);
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
      processor: opts.processor
    })
  );
  return serverId;
}

async function serverHeatbeat(serverId) {
  while (bServerHeatbeat) {
    await $r().setexAsync(`SVR##${serverId}`, 60 * 5, new Date()); // 5分钟超时
    await sleep(60*1000); // 每隔1分钟刷新.
  }
}

async function handleServerClose(serverId) {
  bServerHeatbeat = false;
  debug('websocket_server closed! uuid=' + serverId);
  // 遍历authed_connections,得到所有的客户连接keys
  let rkeys = [];
  forOwn(authed_connections, (clients, userId) => {
    clients &&
      clients.map(client => {
        rkeys.push(`UC##${userId}##${serverId}##${client}`);
      });
  });
  for (let i = 0; i < rkeys.length; i++) {
    await $r().delAsync(rkeys[i]);
  }
  await $r().delAsync(`SVR##${serverId}`);

  // 清空connections
  client_connections = {};
  // 清空user_connections_in_memory
  authed_connections = {};
}

function handleNewClientConnection(ws, req, opts) {
  const ip = req.connection.remoteAddress;
  const port = req.connection.remotePort;
  const clientName = ip + port;

  debug('new client is arrive and connect!', clientName);
  ws.on('close', async () => await handleClientClose({ ip, port, ws }));
  ws.on('error', error => handleClientError({ ip, port, ws, error }));

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
      server: opts.server,
      ws,
      serverId: opts.serverId,
      ip,
      port,
      processor: opts.processor
    })
  );

  // 保存到connections中等待认证后更新到user_connections_in_memory中.
  let key = ip + '##' + port;
  client_connections[key] = { ip, port, ws, serverId: opts.serverId };
}

/**
 * 处理客户端关闭事件.
 * @param {json} opts {ws: 客户端websocket, serverId: 服务器id, ip: 客户端ip, port: 客户端端口}
 */
async function handleClientClose(opts) {
  let { ip, port } = opts;
  // 删除与登录有关内存键值及redis中键值.
  await handleLogout(opts);
  // 从client_connections中删除相关键.
  let client_connection_key = `${ip}##${port}`;
  delete client_connections[client_connection_key];
}

/**
 * 处理客户端错误事件.
 * @param {json} opts {ws: 客户端websocket, serverId: 服务器id, ip: 客户端ip, port: 客户端端口}
 */
function handleClientError(opts) {
  console.log('handleClientError', opts.ip, opts.port, opts.error);
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
  debug('received: ', message, { ip, port, serverId }, client_connections, authed_connections);
  let msg = null;
  try {
    msg = JSON.parse(message);
  } catch (error) {
    debug('error!', error);
    return false;
  }
  let result = null;
  switch (msg.type) {
    case 'auth': result = await handleAuth(msg, opts); break;
    case 'logout': result = await handleLogout(opts); break;
    case 'heatbeat': result = ws.send(JSON.stringify({ type: 'heatbeat_reply', time: new Date() })); break;
    default: {
      // 其他消息可以直接推送到消息处理服务器.
      // session_create, session_add_user, session_remove_user, session_exit,
      // msg_send, msg_recv, msg_cancel, msg_accept, msg_refuse, msg_editing
      let client_connection_key = `${ip}##${port}`;
      let client_connection = client_connections[client_connection_key];
      let userId = client_connection && client_connection.userId;
      msg.userId = userId;
      result = await processor(msg, { serverId, ip, port });
      break;
    }
  }
  debug('+received: ', client_connections, authed_connections);
  return result;

  // // 广播消息给所有客户端
  // opts.server.clients.forEach(function each(client) {
  //   if (client.readyState === WebSocket.OPEN) {
  //     client.send( clientName + " -> " + message);
  //   }
  // });
}

async function handleLogout(opts) {
  // 清除authed_connections及redis中相关信息.
  let { ip, port } = opts;
  let client_connection_key = `${ip}##${port}`;
  let client_connection = client_connections[client_connection_key];
  if (client_connection) {
    let userId = client_connection.userId;
    if (userId) {
      // 用户已经登录,删除authed_connections中相关部分
      let authed_connection = authed_connections[userId];
      if (authed_connection) {
        let n_authed_connection = without(
          authed_connection,
          client_connection_key
        );
        if (n_authed_connection.length > 0) {
          // 该用户还有其他连接保持,更新.
          authed_connections[userId] = n_authed_connection;
        } else {
          // 该用户已没有连接,删除整个键
          delete authed_connections[userId];
        }
      }

      // 删除redis中相关键值
      let rkey = `UC##${userId}##${opts.serverId}##${client_connection_key}`;
      await $r().delAsync(rkey);

      // 删除连接信息中userId.
      delete client_connection[userId];
      client_connections[client_connection_key] = client_connection;
    }
  }
  return true;
}

async function handleAuth(msg, opts) {
  let userId = null;
  let token = msg.token;
  try {
    let tokenobj = await tokenVerifyThin(msg.token);
    userId = tokenobj && tokenobj._id;
  } catch (e) {
    debug('error!', e);
  }

  if (!token || !userId) {
    console.log('认证失败!未找到token和userId!', msg);
    return false;
  }

  let { ip, port } = opts;
  let client_connection_key = `${ip}##${port}`;
  let client_connection = client_connections[client_connection_key] || {};
  // 更新 client_connections
  client_connections[client_connection_key] = {
    ...client_connection,
    userId,
    token
  };

  // 添加进 authed_connections
  let authed_connection = authed_connections[userId] || [];
  authed_connection.push(client_connection_key);
  let n_authed_connection = uniq(authed_connection);
  authed_connections[userId] = n_authed_connection;

  // 创建 redis中 authed_connections_in_redis
  let rkey = `UC##${userId}##${opts.serverId}##${client_connection_key}`;
  await $r().setexAsync(rkey, 24 * 60 * 60, opts.serverId); // 24小时后超时,自动删除.

  return true;
}

export function sendClientMessage(ip, port, message) {
  let client_connection_key = `${ip}##${port}`;

  let client_connection = client_connections[client_connection_key];
  let ws = client_connection && client_connection.ws;
  if (!ws) {
    debug('error! ws is null!', { ip, port });
    return false;
  }
  let strmsg = JSON.stringify(message);
  debug('sendClientMessage', strmsg);
  ws.send(strmsg);
  return true;
}
