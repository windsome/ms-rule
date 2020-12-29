## IM即时通讯系统设计
### 架构分层
1. 客户端: 
+ APP, 通过socket/websocket及HTTP-API与消息服务器及API接口服务器通讯.
+ web/H5 通过websocket/http长连接及HTTP-API与消息服务器及API接口服务器通讯
2. 服务器端-接入部分:
+ 使用HTTP-API及socket(websocket)与客户端通信.
+ socket可能使用socket.io满足多端同时使用.
+ socket也可能直接使用mqtt-broker作为服务器作为通信中转.
3. 服务器端-数据入库/入文件系统.
+ 文件/图片/视频/音频等上传到文件存储服务器,返回访问链接.
+ 文字信息及文件/图片/视频/音频上传链接通过rabbitmq队列按序保存进数据库.
+ 注意消息存储格式
4. 鉴黄鉴政等处理,形成处理后数据.
5. 服务器端消息数据推送
+ 推送机制设计
+ 注意消息体格式
6. 视频/音频实时通话系统,视频/音频会议系统
+ 流媒体服务

### 服务器端架构
1. 用户系统(大部分情况下会使用外部用户系统,IM系统中用userId和token建立联系)
2. 数据库系统(mongodb)
3. 消息推送系统mqtt
4. 消息队列系统rabbitmq
5. 文件上传存储系统

### 数据库系统
1. 用户状态表 user(user详情使用外部用户系统, 内部维护用户状态)
{
    _id 外部用户_id
    status 状态(类似QQ的状态): 在线(socket连接中),离线(socket未连接),忙碌
    token 外部用户token用来业务逻辑认证 // 是否放在connections中,用于支持多端同时用各自token来鉴权.
    //editStatus 当前处于编辑状态的对话(用于显示类似微信的"对方编辑中")
    msgTopic 个人接收消息的topic.(由服务器发送,不能由客户端直接发送,否则会导致篡改消息,客户端收到消息需要做认证,只接收服务器来的消息) eg: /root/user/:_id
    videoPushUrl 视频推送地址.//每个人仅能发出一个视频或者音频流
    audioPushUrl 音频推送地址.//每个人仅能发出一个视频或者音频流
    lastLoginAt 最后一次登录时间
    lastActiveAt 最后活跃时间(即最后一次通信时间,收到客户端消息时间,包括心跳等系统消息,可用于判断是否已经不活跃)
    connections 是个json列表,可能有多个连接,包含连接信息[{socket,token等}]
}
2. 会话表 session
{
    _id 会话id
    creator 创建者
    owner 拥有者(群主)
    members 会话参与者id列表 [_id]
    createdAt 创建时间
    updatedAt 最后消息时间
}
3. 接收的消息表 messagerecv
{
    _id 消息_id
    clientMsgId 客户端消息id,用来判断是否为重复消息.(某些超时消息重发等) 用客户端时间戳timestamp即可, 配合用户Id可以标识消息.如果多端进行,可以配合设备号或socket编号.
    sender 发送者用户id
    session 会话(接收者),此处存放会话id,真实接受者是某个回话中所有人,单聊是包含1个用户id,多聊有多个用户id
    content 是个json,支持各种消息,包括系统消息 {type:消息类型, text: 文字, images, videos, files, audios, link, share, reference等等}
    deal 经过鉴黄鉴证后的消息内容.
    cancel 是否撤回/取消
    expire 失效时长,以秒为单位, 比如视频/音频通话等, 0 表示没有过期时间.
    createdAt 创建时间
}
4. 发送的消息表(服务器消息转发表) messagesend
{
    _id 消息id
    recvId 接收表中的消息id
    session 对应的会话,如果用户退出回话,则消息忽略发送.
    status 消息发送状态 0未发送,1发送成功,2发送失败(按顺序发送,发送失败不再发送下一条),3用户已不在会话不发送
    receiver 接收者用户Id
    retry 重试次数.(对于需要再次发送的未成功消息一般需要存放在redis中,监听到用户上线需要重发)
    cancel 是否撤回/取消
    expire 失效时长,以秒为单位, 比如视频/音频通话等, 0 表示没有过期时间.
    createdAt 创建时间
    updatedAt 更新时间(发送过即更新)
}

### 消息类型
#### 连接/登录/注销相关
1. 连接成功消息后认证消息 auth
{
    type: 'auth'
    token, // 通用字段
    user // 通用字段
}
2. 心跳消息及回复 heatbeat / heatbeat_reply
{
    type:'heatbeat'
}
3. 登出消息 logout
{
    type: 'logout'
}
4. 回复消息一般为 ***_reply
{
    type,
    userId,
    errcode: 0 成功, 1失败,...其他错误.
    // 对于message消息, 还需带clientMsgId或messagesendId或messagerecvId, 用来判断相应消息是否接收或发送成功.
}
#### 会话相关(这部分均有reply消息用来反馈处理结果)
1. C=>S创建会话 session_create
{
    type: 'session_create'
    creator // 创建者即是owner
    owner // =creator
    members: [] // 初次邀请的人
}
S->C服务器返回 session_create_reply
{
    type: 'session_create_reply',
    entities: {
        session: {[id1]: {...}}
    },
    model: 'session',
    result: [id1]
}

2. C=>S邀请进会话 session_add_user
{
    type: '',
    session
    members: [] // 添加的人员列表
}
3. C=>S人员移出会话 session_remove_user
{
    type
    session
    members: [] // 移除的人员列表,邀请人可以移除他邀请的人, 自己可以将自己移除, 管理员可以移除其他所有人, 管理员移除自己则随机找排序第一的人作为owner, creator不变. 如果成员全部移除,则回话不再显示,标记为已失效.
}
4. C=>S自己退出会话 session_exit, 同session_remove_user中移除自己部分.
{
    type
    session
}
#### 消息编辑状态相关
1. C=>S客户端发送编辑中 msg_editing
{
    type
    session //会话
}
2. S=>C客户端接收到的编辑中 msg_editing_reply
{
    type
    session
}

#### 消息相关
1. C=>S发送消息 msg_send (服务器端确认msg_send_reply)
{
    type
    session
    clientMsgId // 客户端生成的id, 防止重复消息, 一般为客户端timestamp.
    content: {type:'text/videos/audios/liveaudio/livevideo/share/link'} //消息内容,又分为各种类型.
}
2. C=>S客户度确认收到服务器转发的消息 msg_recv (服务器将该消息messagerecvId标记为已发送)
{
    type
    session
    messagerecvId // 接收表中id (冗余字段,可以不要)
    messagesendId // 发送表中id
}
3. C=>S撤回消息 msg_cancel
{
    type
    session
    messagerecvId // 需要撤回的消息Id
}
4. 音频/视频通话会议等需要确认后建立视频流/音频流的连接 msg_accept
{
    type
    session
    messagerecvId // 接收表中id (冗余字段,可以不要)
    messagesendId // 发送表中id
}
4. 音频/视频通话会议等拒绝连接 msg_refuse (对于超时处理,是否可由客户端超时发出拒绝消息)
{
    type
    session
    messagerecvId // 接收表中id (冗余字段,可以不要)
    messagesendId // 发送表中id
}

### 消息主题设计
1. 服务器端接收消息topic为 /root/server/:_id (用户id)
2. 客户端接收消息topic为 /root/client/:_id (用户id)
3. 客户端/服务器端可以用token来标识消息是否合法,如果多端使用有多个token,怎么操作?(可以防在connections字段中)

### 消息处理通用流程
1. 客户端先建立连接,朝服务器TOPIC,发送connected消息
2. 服务器端收到后, 调用外部系统鉴权. 如果更改了token,则需要重新鉴权并更新connections.
3. 服务器端处理消息,做出反馈,对于message消息,入message_recv库,做鉴缓鉴政,生成deal字段为处理后的消息.同时根据session中members列表,生成一系列预发送消息,将消息放入到message_send中.
4. 循环遍历member的在线状态,找到所有在线的members, 挨个开始发送消息.
5. 发送消息到客户端TOPIC, 首先寻找此人历史该发送却未成功的消息,挨条发送出去, 遇到失败的, 则停止发送后续的消息.

### 撤回消息流程
1.  客户端发送msg_cancel, 服务器端处理messagerecvId相对应的两张表.

### 视频/音频通话会议等失效处理.(客户端处理,还是服务器端处理,建议客户端发送)
1.  客户端发出msg_refuse消息,服务器端直接标记为发送成功.

### 文件上传存储处理
1. 为外部系统, 客户端做好上传(或者服务器端做反向代理,做代理转发),最后生成的链接存在于content中.
