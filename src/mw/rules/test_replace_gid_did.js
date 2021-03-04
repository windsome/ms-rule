require('babel-register');
let func = require('./msgProcessor').replaceGroupIdWithDeviceId;

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
