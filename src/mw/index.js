import { createRule, updateRule, removeRule } from './restful/rule';

export { msgProcessor } from './rules/msgProcessor';
export { createServer, sendClientMessage } from './ws/createServer';

export default {
  createRule,
  updateRule,
  removeRule
};
