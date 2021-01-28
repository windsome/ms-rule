## 项目简介
规则处理微服务  
## 业务流程
1. 接收来自ms-ctwingiot中rabbitmq的设备数据变化消息, 
```
cfg: { topic: 'topic_iot', key: 'msg/[dataReport|commandResponse|deviceOnlineOfflineReport]'}
dataReport: {_id: 'deviceId', payload: {...}}
```
2. 接收来自模拟设备(定时器)来的定时触发消息
3. 处理收到的消息
4. 匹配消息关联的规则列表,计算出触发的事件.
5. 执行相应的事件.
## 程序流程
1. 查找出所有rules,挨个处理: 根据device._id找到每个规则涉及的设备列表.存放进redis
```
{
    [device._id1]: [rule1, rule2, rule3],
    [device._id2]: [rule3, rule4, rule5]
}
```
2. 监听ctwing-mq上报的设备变化消息,监听模拟设备(定时器)来的消息
3. 找到该设备匹配的规则列表,并初始化规则引擎(facts,operators,).
特殊facts: $_CURRENT_TIME 当前时间.

## rule
{
    conditions: {
        "all/any": [{
            fact: 'device_prop_temperature',
            params: {
                _id: 'xxxx'
            },
            operator: 'greaterThanInclusive',
            value: 10
        },{
            fact: 'device_prop_temperature',
            params: {
                _id: 'xxxx'
            },
            operator: 'lessThan',
            value: 40
        }]
    },
    event: {
        type: 'temperature normal'
    }
}
