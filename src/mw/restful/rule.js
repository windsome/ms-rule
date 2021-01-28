import _debug from 'debug';
const debug = _debug('app:restful:device');
import Errcode, { EC } from '../../Errcode';
import config from '../../config';

import { $rpc } from '../../utils/jaysonClient';
import _getFirstOfRetrieve from '../_getFirstOfRetrieve';

/**
 * 创建设备
 * 注意:
 * 1. product和desc.productId需存在至少1个,并且必须匹配,若同时存在,则以desc.productId为准.可通过desc.productId查到product._id后替换product
 * @param {json} args 需更新的字段 {platform, product, desc[具体平台的描述信息] }
 */
export async function createRule(args) {
  let { input, output } = args;
  if (!input || !output) {
    throw new Errcode('error! missing params!', EC.ERR_PARAM_ERROR);
  }
  // 处理有效性.
  // 入库并返回
  return await $rpc('iotdevice').createRule({
    ...args
  });
}

/**
 * 更新设备
 * 注意:
 * 1. 只有desc字段[表示在实际平台的设备信息]存在时,才去ctwing更新设备.
 * 2. product字段不允许更新,不允许设备改变所属产品.
 * 3. desc中字段内容根据ctwing更新的实际参数需求而定.
 * @param {string} _id
 * @param {json} args 需更新的字段 {desc, state, _notsync[表示desc内容不同步到ctwing]}
 */
export async function updateRule(_id, args) {
  // 处理有效性.

  // 更新成功后写入数据库.
  return await $rpc('iotdevice').updateRule(_id, args);
}

/**
 * 删除规则
 * @param {string} _id
 */
export async function removeRule(_id) {
  // 处理有效性

  // 更新数据库
  let { result } = await $rpc('iotdevice').removeRule(_id);
  return {
    errcode: 0,
    result
  };
}

export async function getRules(qopts) {
  return await $rpc('iotdevice').getRules(qopts);
}
