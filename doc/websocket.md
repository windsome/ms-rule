## websocket无状态系统设计
### 架构分层
1. websocket客户端: 
+ APP, 通过socket/websocket及HTTP-API与消息服务器及API接口服务器通讯.
+ web/H5 通过websocket/http长连接及HTTP-API与消息服务器及API接口服务器通讯
2. websocket服务器端-接入部分:
+ 使用HTTP-API及socket(websocket)与客户端通信.
+ socket可能使用socket.io满足多端同时使用.
+ socket也可能直接使用mqtt-broker作为服务器作为通信中转.
3. 业务处理服务器(消息队列)
+ 监听来自websocket服务器发送的topic消息.
+ 处理消息
+ 需要反馈的消息,通过topic发送出去.

### 通讯流程
1. 服务器端开启websocket端口,产生一个UUID,缓存到redis,并定时1分钟更新此key.超时时间为5分钟.
    key=WSSERVER_<UUID>, value={ip,port}
2. 客户端连接服务器端,服务器端收到连接后,产生一个数据连接,保存连接信息到内存
    unauthed_connections: {
        [ip1]##[port1]: {ip, port, data_conn}
    }
3. 连接建立后,客户端发送包含jwt的认证消息(auth),服务器端收到后,解析得到用户_id,保存到内存及redis
    authed_connections: {
        [user_id1]: {
            [client_ip]##[client_port]: {ip, port, token, data_conn, userId}
        },
    }
    因redis中不能保存data_conn连接信息,我们只能保存一个缩减版到redis中.
    authed_connections_in_redis: {
        UCIR##[user_id1]##[WSSERVER_UUID]##[client_ip]##[client_port]: token,
    }
4. 服务器收到客户端的其他消息后,发送到消息缓存队列(rabbitmq),topic为`/<业务空间namespace>/server`
    {userId, <WSSERVER_UUID>, ...其他消息内容}
5. 消息队列服务器挨个处理收到的消息,并将结果通过topic为`/<业务空间namespace>/wsserver/<WSSERVER_UUID>`返回相应的websocket服务器.注意:某些群发消息可能发给在其他<WSSERVER_UUID>上的其他人.
    + 处理收到的消息,得到需要发送给的人员列表
    + 找到每个人在redis中的连接列表.根据前缀`UCIR##[user_id1]##`得到<WSSERVER_UUID>列表
    + 挨个往`/<业务空间namespace>/wsserver/<WSSERVER_UUID>`发送消息.{userId, <WSSERVER_UUID>, ...其他消息内容}
    + wsserver根据user_id得到该用户连接列表,挨个发送.
    + 完成.

### 如何做到无状态服务器.
如何做到无状态服务器(stateless).
websocket服务器是有状态的. 因为需要维护客户连接列表,每个连接为socket对象,连接需要保持,进行双向通信.
但是,我们应用可能需要多个replicas同时运行以分担网络请求及任务处理压力.
分析IM认证流程:
1. websocket server启动,从redis中获取该server的编号,以后将监听发给本server的消息.
2. websocket 客户端连接服务器
3. 服务器端接收到客户端连接,将此连接connection保存在内存中,数据结构为 {[ip+port]:connection}
4. 客户端发送认证请求{token,user}
5. 服务器端接收到认证请求,做认证处理,失败返回认证失败的错误.成功则将connection保存进认证后的数据结构中user_connections_in_memory及user_connections_in_redis,并返回客户端认证成功消息auth_reply.
分析IM消息流程:
1. 服务器端在客户认证通过后,将存留的消息发送给该客户.(同步消息).
2. 客户端发送消息到服务器,并指定某个session
3. 服务器收到消息后,发送到消息队列.
4. 消息处理服务器,从队列接收到一条消息,根据clientMsgId判断是否已经在messagerecv表中,不在则处理鉴黄鉴证后将该消息进messagerecv表.
5. 根据该消息所在session,找到所有在此session中的人,生成发送消息列表,入messagesend表.
6. 找到该session所有在线的人(注意:一个人可能有多个连接connection),将消息往所有这些人的connection推送,并将messagesend消息标记为发送中.
7. websocket服务器接收到推往自己的消息,并根据connection_name挨个发送(message_send).
8. websocket客户端收到消息,发送已收到命令(message_send_reply)给websocket服务器.
9. websocket服务器收到message_send_reply后,将相应messagesend记录状态设置为已发送成功.
分析IM客户端退出流程:
1. 客户端直接断开websocket连接,服务器端会触发一个disconnect事件
2. 服务器收到disconnect事件后,在user_connections_in_memory和user_connections_in_redis中去掉相应键值.
分析IM收发服务器退出流程:
1. server退出时会收到close事件.
2. 清除user_connections_in_memory
3. 清除user_connections_in_redis中该server对应的所有连接.
分析消息处理流程:
1. websocket收发服务器收到用户消息,发送到mq: im.processor 中,
2. 消息处理服务器接收mq: im.processor 中消息,并处理.处理后的反馈消息需要发送到用户,首先发送到websocket收发服务器.
3. websocket服务器监听mq: im.exchange.<serverid>
