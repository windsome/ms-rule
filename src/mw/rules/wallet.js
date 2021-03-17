import { $rpc } from '../../utils/jaysonClient';
import _debug from 'debug';
const debug = _debug('app:rules:useWallet');
const PRODUCT_ID_ALARMER = '5ffd331a1111111111000002';

export async function checkWallet(device, command) {
  if (!device) return false;
  if (device.product != PRODUCT_ID_ALARMER) {
    return true;
  }
  let deviceProp = { ...(device.desc || {}), ...(device.prop || {}) };
  // 判断发送警报需要的积分值
  let { username_1, openid_1, phone_1, smsphone_1 } = deviceProp;
  let point = 0;
  if (smsphone_1) {
    point += 1;
  }
  if (phone_1) {
    point += 1;
  }
  try {
    if (point > 0) {
      let appinfo = command.appinfo || {};
      let appuser = appinfo.user;
      if (appuser) {
        let wallet = await $rpc('payment').getWallet(appuser);
        if (wallet.point > point) {
          return true;
        }
      }
    }
    return false;
  } catch (error) {
    debug('error!', error.message);
    return false;
  }
}

export async function useWallet(device, command) {
  if (!device) return false;
  if (device.product != PRODUCT_ID_ALARMER) {
    return true;
  }
  let deviceProp = { ...(device.desc || {}), ...(device.prop || {}) };
  // 判断发送警报需要的积分值
  let { username_1, openid_1, phone_1, smsphone_1 } = deviceProp;
  let titleArgs = [];
  let briefArgs = [];
  let point = 0;
  if (smsphone_1) {
    point += 1;
    titleArgs.push('短信');
    briefArgs.push('短信:' + smsphone_1);
  }
  if (phone_1) {
    point += 1;
    titleArgs.push('电话');
    briefArgs.push('电话:' + phone_1);
  }
  try {
    if (point > 0) {
      let title = '报警:' + titleArgs.join(',');
      let brief = briefArgs.join(',');
      let appinfo = command.appinfo || {};
      let appuser = appinfo.user;
      if (appuser) {
        let wallet = await $rpc('payment').useWallet(appuser, {
          title,
          brief,
          point: -point,
          desc: {
            ...appinfo,
            type: 'rule'
          }
        });
      }
    }
    return true;
  } catch (error) {
    debug('error!', error.message);
    return false;
  }
}
