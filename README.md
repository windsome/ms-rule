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
### 设备联动处理规则
{
    conditions: {
        "all/any": [{
            fact: 'device',
            params: {
                _id: 'xxxx'
            },
            path: '$.prop.temperature_1',
            operator: 'greaterThanInclusive',
            value: 10
        },{
            fact: 'group',
            params: {
                _id: 'xxxx'
            },
            path: '$.prop.temperature_1',
            operator: 'lessThan',
            value: 40
        }]
    },
    event: {
        type: 'evt_device',
        '5ffd331a2222222222000004': {
            reason_1: '温度小于10报警',
            [属性名]:[属性值]
        }
    }
}

### 报警规则
报警内容为: [rule.name][device.attribute]出问题了.
{
    conditions: {
        "all/any": [{
            fact: 'device',
            params: {
                _id: 'xxxx'
            },
            path: '$.prop.temperature_1',
            operator: 'greaterThanInclusive',
            value: 10
        },{
            fact: 'group',
            params: {
                _id: 'xxxx'
            },
            path: '$.prop.temperature_1',
            operator: 'lessThan',
            value: 40
        }]
    },
    event: {
        type: 'evt_alarm',
        '5ffd331a2222222222000004': { // alarmcfg._id, 报警配置_id
            name: '报警给王工,张工',
            contacts:[
                {_id, name:'王工', sms:'13661989491',phone:'13661989491',weixin:'xxxxx'},
                {_id, name:'张工', sms:'13661989491',phone:'13661989491'},
                {_id, name:'张工', sms:'13661989491'},
            ]
        },
        '5ffd331a2222222222000005': { // alarmcfg._id, 报警配置_id
            name: '报警给汪工,李工,姚工',
            contacts:[
                {_id, name:'汪工', sms:'13661989491',phone:'13661989491',weixin:'xxxxx'},
                {_id, name:'李工', sms:'13661989491',phone:'13661989491'},
                {_id, name:'姚工', sms:'13661989491'},
            ]
        },
    }
}
