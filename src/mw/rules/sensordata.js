import _debug from 'debug';
const debug = _debug('app:mw:rules:sensordata');
import { $rpc } from '../../utils/jaysonClient';
import _getFirstOfRetrieve from '../../utils/jaysonRestful';
function isNumber(obj) {
  return typeof obj === 'number' && !isNaN(obj);
}

/**
 * 将上报的数据转换为传感器数据保存. 简化起见, 不查找device及product,直接将所有数据入库.
 * @param {json} device 设备记录 {_id, product}
 * @param {json} payload 数据上报消息的内容(已经解码后的), {[prop1]:[value1],[prop2]:[value2]}
 */
export default async function dataReport(message) {
  if (!message) {
    debug('error parameters! no message!');
    return false;
  }
  let { _id, type, pid, timestamp, payload } = message;
  if (type != 'dataReport') {
    // 只处理dataReport数据
    return false;
  }
  if (!timestamp) {
    timestamp = new Date().getTime();
  } else {
    timestamp = new Number(timestamp);
    if (timestamp < 10000000000) {
      // 10位timestamp,需要乘以1000.
      timestamp *= 1000;
    }
  }

  // 遍历payload.挨个创建sensordata记录.
  let sensors = [];
  let codes = Object.getOwnPropertyNames(payload);
  for (let i = 0; i < codes.length; i++) {
    // 从spec中找code对应的name.
    let code = codes[i];
    let orig = payload[code];
    let value = null;
    try {
      value = Number(orig);
      if (!isNumber(value)) value = null;
    } catch (error) {}
    sensors.push({ code, orig, value });
  }

  // 创建sensordata.
  let result = [];
  for (let i = 0; i < sensors.length; i++) {
    let sensor = sensors[i];
    let args = {
      device: _id,
      code: sensor.code,
      createdAt: new Date(timestamp),
      desc: {
        orig: sensor.orig,
        value: sensor.value
      }
    };
    // debug('createSensordata', args);
    let sensordata = await $rpc('iot1gapis').createSensordata({}, args);
    result.push(sensordata);
  }
  debug(`create sensordata(${result.length}):`, JSON.stringify(result));
  return true;
}
