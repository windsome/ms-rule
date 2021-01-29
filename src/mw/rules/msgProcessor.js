import _debug from 'debug';
const debug = _debug('app:rules:msgProcessor');

import { getRules } from '../restful/rule';
import { Engine } from 'json-rules-engine';
import { $rpc } from '../../utils/jaysonClient';

function genRules(dbResult) {
  debug('genRules', dbResult);
  if (!dbResult) return null;
  let { result, entities } = dbResult;
  if (!result || !entities) return null;
  let dbRule = entities.rule;
  if (!dbRule) return null;
  // 遍历规则,得到处理后的规则列表.
  return result.map(id => {
    let entity = dbRule[id];
    return { conditions: entity.input, event: entity.output };
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
 *     type: 'evt_alarm_issued',
 *     params: {
 *       _id: '5ffd331a2222222222000004', //报警器_id
 *       content: JSON.stringify({phone: '您的设备出了xxx故障',weixin: '您的设备出了xxx故障,请访问http://xxx.xxx',sms: '您的设备出了xxx故障'})
 *     }
 *   }
 */
async function sendEvent(event) {
  // 获取目标设备_id
  let params = (event && event.params) || {};
  let { _id, ...args } = params;
  if (_id) {
    // args 为需要设置的属性内容,即command内容
    let device = await getDevice(_id);
    if (!device) {
      debug('error! not find device._id=' + _id);
      return false;
    }
    // debug('转换event为command');

    // 发送command
    let platform = device.platform;
    if (platform == 'ctwing') {
      await $rpc('ctwingiot').createCommand({ device: _id, platform, ...args });
    } else if (platform == 'yihong') {
      await $rpc('simulator').createCommand({
        device: _id,
        platform,
        desc: { content: { payload: args } }
      });
    } else {
      debug(
        'error! not support platform of device!' + JSON.stringify(device),
        JSON.stringify(event)
      );
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
  engine.addOperator('hourOfTimeBetween', (factValue, jsonValue) => {
    console.log(
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
      // 初始化RuleEngine,
      let engine = initEngine(rules);
      if (engine) {
        // 得到触发的event列表
        let { events } = await engine.run(payload);
        debug('rule engine result events:', JSON.stringify(rules), events);

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
