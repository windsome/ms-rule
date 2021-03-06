require('babel-register');
let type = require('../../utils/type').default;
let cloneDeep = require('lodash/cloneDeep');

// let func = require('./msgProcessor').replaceGroupIdWithDeviceId;
function replaceGroupIdWithDeviceId(input, gid, did) {
  if (!input) return null;
  let keys = Object.getOwnPropertyNames(input);
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i];
    let value = input[key];
    if (key == 'params') {
      let id = value && value['_id'];
      if (id == gid) {
        value['_id'] = did;
      }
    } else if (type(value) === 'array') {
      for (let j = 0; j < value.length; j++) {
        value[j] = replaceGroupIdWithDeviceId(value[j], gid, did);
      }
    } else if (type(value) === 'object') {
      input[key] = replaceGroupIdWithDeviceId(value, gid, did);
    }
  }
  return input;
}
let func = replaceGroupIdWithDeviceId;

let input = {
  all: [
    {
      fact: 'device',
      params: {
        _id: '5ffd331a2222222222000001'
      },
      operator: 'hourOfTimeBetween',
      value: [8, 20],
      path: '$.prop.timestamp'
    },
    {
      fact: 'device',
      params: {
        _id: '5ffd331a2222222222000001'
      },
      operator: 'equal',
      value: true,
      path: '$.prop.switch_1'
    }
  ]
};

console.log(JSON.stringify(input));
let result = func(
  input,
  '5ffd331a2222222222000001',
  '5ffd331a2222222222000002'
);
console.log(JSON.stringify(result));
