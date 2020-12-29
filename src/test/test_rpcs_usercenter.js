import { init, $rpc } from '../utils/jaysonClient';

async function test_db_acts() {
  let ret = null;
  ret = await $rpc('usercenter').createUser({
    nickname: 'test',
    extend: { phone: 'test' }
  });
  console.log('createUser:', ret);
  let tuser = ret.result;
  ret = await $rpc('usercenter').getUser(tuser._id);
  console.log('getUser:', ret);
  ret = await $rpc('usercenter').getUser(tuser._id, { extend: true });
  console.log('getUser2:', ret);
  ret = await $rpc('usercenter').getUsers({ where: {}, limit: 10 });
  console.log('getUsers:', ret, ret.result.entities.user);
  ret = await $rpc('usercenter').getUsers(
    { where: {}, limit: 10 },
    { extend: true }
  );
  console.log('getUsers2:', ret, ret.result.entities.user);
  ret = await $rpc('usercenter').updateUser(tuser._id, {
    nickname: 'test1',
    extend: { phone: 'test1' }
  });
  console.log('updateUser:', ret);
  ret = await $rpc('usercenter').removeUser(tuser._id);
  console.log('removeUser:', ret);
}

async function test_auth1() {
  let ret = null;
  ret = await $rpc('usercenter').authByPhonePass('root', '123456');
  console.log('authByPhonePass:', ret);
}

async function test_auth2() {
  let ret = null;

  ret = await $rpc('usercenter').getSms('13661989491', {
    AccessKeyId: 'LTAIXBa5lLGkHzgd',
    AccessKeySecret: 'WsHdIdg29kd8mKyGwDIkmonBs71Moh',
    SignName: '绿色智行',
    TemplateCode: 'SMS_142154980',
    Type: '验证码',
    Name: '身份验证验证码',
    Content:
      '验证码${code}，您正在进行身份验证，勿告诉别人，如果不是您的操作，请忽略！',
    Desc: ''
  });
  console.log('getSms:', ret);
  ret = await $rpc('usercenter').authByPhoneSms('17610777993', '1111');
  console.log('authByPhoneSms:', ret);
  ret = await $rpc('usercenter').authByPhoneSms('13661989491', '1111');
  console.log('authByPhoneSms:', ret);
}

async function test_auth3() {
  let ret = null;

  ret = await $rpc('usercenter').getAuthorizeURL('http://m.h5ren.com/a');
  console.log('getAuthorizeURL:', ret);

  ret = await $rpc('usercenter').authByCodeState('123456', '123456');
  console.log('authByCodeState:', ret);
}

async function test_noop() {
  let ret = null;

  ret = await $rpc('usercenter').notexists('123456', '123456');
  console.log('notexists:', ret);
}

export default async function main() {
  try {
    init({
      usercenter: {
        ops: [
          'authByPhonePass',
          'getSms',
          'authByPhoneSms',
          'getAuthorizeURL',
          'authByCodeState',
          'createUser',
          'getUser',
          'getUsers',
          'updateUser',
          'removeUser'
        ],
        port: 3102
      }
    });
    // await test_db_acts();
    // await test_auth1();
    // await test_auth2();
    // await test_auth3();
    await test_noop();
  } catch (error) {
    console.error('get error:', error);
  }
}
