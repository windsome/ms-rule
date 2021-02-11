import _debug from 'debug';
const debug = _debug('app:rules:msgProcessor');

import { getRules } from '../restful/rule';
import { Engine } from 'json-rules-engine';
import { $rpc } from '../../utils/jaysonClient';

function genRules(dbResult) {
  // debug('genRules', JSON.stringify(dbResult));
  if (!dbResult) return null;
  let { result, entities } = dbResult;
  if (!result || !entities) return null;
  let dbRule = entities.rule;
  if (!dbRule) return null;
  // 遍历规则,得到处理后的规则列表.
  return result.map(id => {
    let entity = dbRule[id];
    let conditions = entity.input || {};
    let output = entity.output || {};
    let appinfo = entity.appinfo || {};
    appinfo = { ...appinfo, rule: id };
    let event = { type: 'evt_device', params: { ...output, appinfo } };
    return { conditions, event };
  });
}

async function getDevice(_id) {
  // 获取单个设备
  let item = await $rpc('iotdevice').getDevice(_id);
  // debug('getDevice', _id, JSON.stringify(item));
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
  // 获取目标设备_id
  let { type, params } = event;
  let { appinfo, ...restparams } = params || {};
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

      // 发送command
      let platform = device.platform;
      if (platform == 'ctwing') {
        await $rpc('ctwingiot').createCommand({
          device: _id,
          platform,
          content,
          appinfo
        });
      } else if (platform == 'yihong') {
        await $rpc('simulator').createCommand({
          device: _id,
          platform,
          content,
          appinfo
        });
      } else {
        debug(
          'error! not support platform of device!' + JSON.stringify(device),
          JSON.stringify(content)
        );
      }
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
    let { _id, payload } = msgobj;
    // let _id = params && params._id;
    if (_id) {
      // 从rule表中找到依赖此device._id的规则列表
      let ret = await getRules({ where: { depend: _id }, limit: 100 });
      let rules = genRules(ret);
      debug(`genRules(${rules.length}):`, JSON.stringify(rules));
      // 初始化RuleEngine,
      let engine = initEngine(rules);
      if (engine) {
        // 得到触发的event列表
        let { events } = await engine.run(payload);
        debug(`engine.run() events(${events.length}):`, JSON.stringify(events));

        // 将event转换为command,发送到目标设备
        for (let i = 0; i < events.length; i++) {
          await sendEvent(events[i]);
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
