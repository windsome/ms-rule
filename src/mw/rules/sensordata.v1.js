import _debug from 'debug';
const debug = _debug('app:mw:ctwingmq:sensordata');
import { $rpc } from '../../utils/jaysonClient';
import _getFirstOfRetrieve from '../../utils/jaysonRestful';

/**
 * 将上报的数据转换为传感器数据保存.
 * @param {json} device 设备记录 {_id, product}
 * @param {json} payload 数据上报消息的内容(已经解码后的), {[prop1]:[value1],[prop2]:[value2]}
 */
export default async function dataReport(device, payload, timestamp) {
  if (!device || !payload) {
    debug('error parameters! no device or payload!');
    return false;
  }
  if (!device.product) {
    debug('error parameters! no device.product!');
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

  // 找到product.
  let product = await $rpc('iotdevice').getProduct(device.product);
  let spec = (product && product.spec) || [];

  // 遍历payload.挨个创建sensordata记录.
  let sensors = [];
  let codes = Object.getOwnPropertyNames(payload);
  for (let i = 0; i < codes.length; i++) {
    // 从spec中找code对应的name.
    let code = codes[i];
    let orig = payload[code];
    let name = '';
    let value = orig;
    for (let j = 0; j < spec.length; j++) {
      let sp = spec[j];
      if (sp.code == code) {
        // 找到code.
        name = sp.name;
        let dtype = sp.dt && sp.dt.type;
        switch (dtype) {
          case 'string':
            value = orig;
            break;
          case 'value':
            value = Number(orig);
            break;
          case 'bool':
            value = Boolean(orig);
            break;
          case 'enum':
            value = orig;
            break;
          default:
            value = orig;
            break;
        }
        break;
      }
    }
    sensors.push({ code, name, orig, value });
  }

  // 创建sensordata.
  let result = [];
  for (let i = 0; i < sensors.length; i++) {
    let sensor = sensors[i];
    let args = {
      device: device._id,
      code: sensor.code,
      createdAt: new Date(timestamp),
      desc: {
        orig: sensor.orig,
        value: sensor.value
      }
    };
    let sensordata = await $rpc('iotdevice').createSensordata(args);
    result.push(sensordata);
  }
  debug('sensordata:', JSON.stringify(result));
  return true;
}
