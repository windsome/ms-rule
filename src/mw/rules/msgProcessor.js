import _debug from 'debug';
const debug = _debug('app:rules:msgProcessor');
import { Engine } from 'json-rules-engine';
import { $rpc } from '../../utils/jaysonClient';
import { itemListOfRetrieve } from '../../utils/jaysonRestful';
import uniq from 'lodash/uniq';
import uniqWith from 'lodash/uniqWith';
// import type from '../../utils/type';
// import cloneDeep from 'lodash/cloneDeep';
import config from '../../config';
import { checkWallet, useWallet } from './wallet';
import insertToSensordata from './sensordata';

async function findGroupIdsOfDeviceId(_id) {
  // 1. 获取所有此设备_id对应的userdevice列表.默认最多100个用户使用此设备,最多找100条.
  let ret2 = await $rpc('iot1gapis').getUserdevices(
    {},
    { where: { device: _id }, limit: 100 }
  );
  let udList = itemListOfRetrieve(ret2);
  // 2. 根据userdevice.appinfo.groups字段得到所有组.
  let groups = [];
  for (let i = 0; i < udList.length; i++) {
    let ud = udList[i];
    let groups1 = (ud.appinfo && ud.appinfo.groups) || [];
    groups = [...groups, ...groups1];
  }
  // debug('findGroupIdsOfDeviceId', _id, ret2, JSON.stringify(udList), groups);
  return uniq(groups);
}

async function updateAllGroupPropOfDeviceId(_id, prop) {
  let groupIdList = await findGroupIdsOfDeviceId(_id);
  for (let i = 0; i < groupIdList.length; i++) {
    let gid = groupIdList[i];
    let ret3 = await $rpc('iot1gapis').updateGroup({}, gid, { prop });
  }
}

async function findRulesByDeviceId(_id) {
  // 数据源1: 获取设备相关rule
  let ret1 = await $rpc('iot1gapis').getRules(
    {},
    { where: { depend: _id, status: 0 }, limit: 100 }
  );
  let rules1 = itemListOfRetrieve(ret1);

  // 数据源2: 获取设备所在分组相关rule
  // 1. 获取deviceId对应的所有groupId.
  let groupIdList = await findGroupIdsOfDeviceId(_id);
  // 3. 获取所有包含此组的rule列表,如果是组规则,则此规则中只允许存在一个组.
  // 否则,有两个组存在时,满足了其中一个条件,还需要遍历另外一个组中所有成员,判断是否满足条件.不合理.
  let rules2 = [];
  for (let i = 0; i < groupIdList.length; i++) {
    let gid = groupIdList[i];
    let ret3 = await $rpc('iot1gapis').getRules(
      {},
      { where: { dependGroups: gid, status: 0 }, limit: 100 }
    );
    let rules3 = itemListOfRetrieve(ret3);
    rules2 = [...rules2, ...rules3];
    // // 将rule中组id,替换成设备id
    // let rules4 = rules3.map(rule => {
    //   return {
    //     ...rule,
    //     input: replaceGroupIdWithDeviceId(cloneDeep(rule.input), gid, _id)
    //   };
    // });
    // rules2 = [...rules2, ...rules4];
  }

  // 合并所有rule.
  let rules = [...rules1, ...rules2];
  debug(
    'findRulesByDeviceId rule count: ',
    _id,
    JSON.stringify({
      device: rules1.length,
      group: rules2.length,
      total: rules.length
    })
  );
  rules = uniqWith(rules, (a, b) => a._id == b._id);
  return rules;
}

/**
 * 转换规则.
 * @param {*} rules 数据库表Rule格式的规则列表
 * @param {*} triggerDeviceId 触发规则的设备id
 */
function transformRules(rules, triggerDeviceId) {
  if (!rules) return null;
  if (rules.length < 1) return null;

  let appauth = config.appauth || {};

  return rules.map(rule => {
    let conditions = rule.input || {};
    let output = rule.output || {};
    let type = rule.type || 'device';
    let user = rule.owner;
    // let appinfo = rule.appinfo || {};
    // appinfo = { ...appinfo, rule: rule._id, trigger: triggerDeviceId };
    let appinfo = {
      user,
      rule: rule._id,
      trigger: triggerDeviceId
    };
    let event = {
      type: 'evt_' + type,
      params: { ...output, appauth, appinfo }
    };
    return { conditions, event };
  });
}

async function getDevice(_id) {
  // 获取单个设备
  let item = await $rpc('iot1gapis').getDevice({}, _id);
  // debug('getDevice', _id, JSON.stringify(item));
  return item;
}

async function getGroup(_id) {
  // 获取单个设备
  let item = await $rpc('iot1gapis').getGroup({}, _id);
  // debug('getGroup', _id, JSON.stringify(item));
  return item;
}

/**
 * 将event组装成command
 * command为{device, product, platform, desc: {
 *    content: {
 *      dataType,
 *      payload: {
 *        [属性名1]:属性值1
 *        [属性名2]:属性值2
 *      }
 *    }
 *  }
 * }
 * @param {json} event rule记录中的output字段,
 * 格式为: { type, params: {
 *    _id:[设备_id],
 *    [属性名1]:属性值1,
 *    [属性名2]:属性值2
 *  }
 * }
 * 如: {
 *     type: 'evt_device',
 *     params: {
 *      '5ffd331a2222222222000004': {
 *        content: JSON.stringify({phone: '您的设备出了xxx故障',weixin: '您的设备出了xxx故障,请访问http://xxx.xxx',sms: '您的设备出了xxx故障'})
 *        [属性名]:[属性值]
 *      },
 *      '5ffd331a2222222222000003': {
 *        content: JSON.stringify({phone: '您的设备出了xxx故障',weixin: '您的设备出了xxx故障,请访问http://xxx.xxx',sms: '您的设备出了xxx故障'})
 *        [属性名]:[属性值]
 *      }
 *     }
 *   }
 */
async function sendEvent(event) {
  // 根据event.type处理不同事件.
  let evt_type = event && event.type;
  if (evt_type == 'evt_device') {
    return await sendDeviceEvent(event);
  } else if (evt_type == 'evt_alarm') {
    return await sendAlarmEvent(event);
  } else {
    debug('error! not support event.type=' + evt_type, JSON.stringify(event));
  }
}

async function sendAlarmEvent(event) {
  // 发送报警事件
  let { type, params } = event;
  let { appauth, appinfo, ...restparams } = params || {};
  let ids = Object.getOwnPropertyNames(restparams);
  for (let i = 0; i < ids.length; i++) {
    let _id = ids[i];
    // 设备_id长度为24,如果非此长度,则表示不是设备.
    let content = restparams[_id] || {};
    try {
      // 查找设备信息
      let device = await getDevice(_id);
      if (!device) {
        debug('error! not find device._id=' + _id);
        return false;
      }
      // debug('转换event为command');

      // 组装命令内容.
      let cmdArgs = {
        device: _id,
        type: 1, //规则触发.
        platform: device.platform,
        content,
        appinfo
      };
      // 如果是警报型的需要进行计费判断.
      let result = await checkWallet(device, cmdArgs);
      if (result) {
        // 扣积分成功后发送command
        await $rpc('iot1gapis').createCommand(appauth, cmdArgs);
        await useWallet(device, cmdArgs);
      }
    } catch (error) {
      debug('error!', error);
    }
  }
}
async function sendDeviceEvent(event) {
  // 发送设备属性控制类型事件
  // 获取目标设备_id
  let { type, params } = event;
  let { appauth, appinfo, ...restparams } = params || {};
  let ids = Object.getOwnPropertyNames(restparams);
  for (let i = 0; i < ids.length; i++) {
    let _id = ids[i];
    // 设备_id长度为24,如果非此长度,则表示不是设备.
    let content = restparams[_id] || {};
    try {
      // 查找设备信息
      let device = await getDevice(_id);
      if (!device) {
        debug('error! not find device._id=' + _id);
        return false;
      }
      // debug('转换event为command');

      // 组装命令内容.
      let cmdArgs = {
        device: _id,
        type: 1, //规则触发.
        platform: device.platform,
        content,
        appinfo
      };
      await $rpc('iot1gapis').createCommand(appauth, cmdArgs);
    } catch (error) {
      debug('error!', error);
    }
  }
}

function initEngine(rules) {
  if (!rules || rules.length == 0) {
    debug('initEngine fail! no rules!');
    return null;
  }
  const engine = new Engine();

  // define a rule for detecting the player has exceeded foul limits.  Foul out any player who:
  // (has committed 5 fouls AND game is 40 minutes) OR (has committed 6 fouls AND game is 48 minutes)
  for (let i = 0; i < rules.length; i++) {
    engine.addRule(rules[i]);
  }

  engine.addFact('device', async function(params, almanac) {
    let _id = params._id;
    return await getDevice(_id);
  });
  engine.addFact('group', async function(params, almanac) {
    let _id = params._id;
    return await getGroup(_id);
  });
  engine.addFact('$_CURRENT_TIME', function(params, almanac) {
    return new Date();
  });

  engine.addOperator(
    'equals',
    (factValue, jsonValue) => factValue == jsonValue
  );
  engine.addOperator(
    'notEquals',
    (factValue, jsonValue) => factValue != jsonValue
  );
  engine.addOperator('hourOfTimeBetween', (factValue, jsonValue) => {
    debug(
      'hourOfTimeBetween',
      factValue,
      jsonValue,
      new Date(factValue).getHours(),
      new Date(factValue * 1000).getHours()
    );
    if (!factValue) return false;
    if (factValue < 10000000000) factValue *= 1000;
    let date = new Date(factValue);
    let hours = date.getHours();
    return hours > jsonValue[0] && hours <= jsonValue[1];
  });
  return engine;
  // let ret = await engine.run(facts);
  // return ret.events;
}

export async function msgProcessor(strmsg) {
  debug('msgProcessor Received:', strmsg);
  // 解析消息,得到设备_id
  let msgobj = null;
  try {
    msgobj = JSON.parse(strmsg);
    await insertToSensordata(msgobj);
    let { _id, payload } = msgobj;
    // let _id = params && params._id;
    if (_id) {
      // 更新组中prop
      if (payload) {
        await updateAllGroupPropOfDeviceId(_id, payload);
      }
      // 从rule表中找到依赖此device._id的规则列表
      let rulesInDb = await findRulesByDeviceId(_id);
      let rules = transformRules(rulesInDb, _id);
      if (rules) {
        debug(`transformRules(${rules.length}):`, JSON.stringify(rules));
        // 初始化RuleEngine,
        let engine = initEngine(rules);
        if (engine) {
          // 得到触发的event列表
          let { events } = await engine.run(payload);
          if (events) {
            debug(
              `engine.run() events(${events.length}):`,
              JSON.stringify(events)
            );
            // 将event转换为command,发送到目标设备
            for (let i = 0; i < events.length; i++) {
              await sendEvent(events[i]);
            }
          }
        }
      }
    }
    debug('+msgProcessor ok!');
    return true;
  } catch (error) {
    debug('+msgProcessor fail!', error);
    return false;
  }
}
