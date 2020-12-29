export default EC => ({
  [EC.ERR_SYSTEM_ERROR]: '系统错误',
  [EC.OK]: '操作正常',
  [EC.ERR_UNAUTH]: '未登录',
  [EC.ERR_3RD_API_FAIL]: '第三方API调用失败',
  [EC.ERR_UNKNOWN]: '未知错误',
  [EC.ERR_BUSY]: '系统忙',
  [EC.ERR_PARAM_ERROR]: '参数错误',
  [EC.ERR_NO_SUCH_API]: '没有此API',
  [EC.ERR_NO_SUCH_ENTITY]: '数据库没有该实体',

  [EC.ERR_SMS_FAIL]: '发送短信失败',
  [EC.ERR_SMS_LIMIT_CONTROL]: '短信发送太频繁',
  [EC.ERR_SMS_DAY_LIMIT_CONTROL]: '短信发送超过天条数限制',
  [EC.ERR_SMS_MONTH_LIMIT_CONTROL]: '短信发送超过月条数限制',

  [EC.ERR_AUTH_NOT_REGIST_PHONE]: '此号码未注册',
  [EC.ERR_AUTH_WRONG_PASSWORD]: '密码错误',
  [EC.ERR_AUTH_SMSCODE_NONE]: '缓存中未找到对应短信验证码',
  [EC.ERR_AUTH_SMSCODE_MISMATCH]: '验证码不匹配',
  [EC.ERR_AUTH_USER_MISMATCH]: '用户不匹配,数据不一致',
  [EC.ERR_AUTH_WXSTATE_NONE]: '缓存中不存在该state',
  [EC.ERR_AUTH_WXSTATE_EXPIRE]: '缓存中state过期'
});
