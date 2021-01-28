'use strict';
/*
 * This example demonstates nested boolean logic - e.g. (x OR y) AND (a OR b).
 *
 * Usage:
 *   node ./examples/02-nested-boolean-logic.js
 *
 * For detailed output:
 *   DEBUG=json-rules-engine node ./examples/02-nested-boolean-logic.js
 */

require('colors');
const { Engine } = require('json-rules-engine');

const rules = {
  rule1: {
    conditions: {
      all: [
        {
          fact: 'device',
          params: {
            _id: 'xxxx'
          },
          operator: 'greaterThanInclusive',
          value: 10,
          path: '$.prop.temperature'
        },
        {
          fact: 'device',
          params: {
            _id: 'xxxx'
          },
          operator: 'lessThan',
          value: 40,
          path: '$.prop.temperature'
        }
      ]
    },
    event: {
      type: 'temperature normal',
      params: {
        _id: 'xxxx'
      }
    }
  },
  rule2: {
    conditions: {
      any: [
        {
          fact: 'device',
          params: {
            _id: 'x1'
          },
          operator: 'greaterThanInclusive',
          value: 40,
          path: '$.prop.temperature'
        },
        {
          fact: 'device',
          params: {
            _id: 'x1'
          },
          operator: 'lessThan',
          value: 10,
          path: '$.prop.temperature'
        },
        {
          fact: '$_CURRENT_TIME',
          operator: 'hourOfTimeBetween',
          value: [20, 21]
        }
      ]
    },
    event: {
      type: 'temperature error!',
      params: {
        _id: 'x1'
      }
    }
  }
};
let devices = {
  xxxx: {
    _id: 'xxxx',
    prop: {
      temperature: 11
    }
  },
  x1: {
    _id: 'x1'
    // prop: {
    //   temperature: 9
    // }
  },
  x2: {
    _id: 'x2',
    prop: {
      temperature: 43
    }
  }
};

async function start() {
  /**
   * Setup a new engine
   */
  const engine = new Engine();

  // define a rule for detecting the player has exceeded foul limits.  Foul out any player who:
  // (has committed 5 fouls AND game is 40 minutes) OR (has committed 6 fouls AND game is 48 minutes)
  engine.addRule(rules.rule1);
  engine.addRule(rules.rule2);
  engine.addFact('device', function(params, almanac) {
    let _id = params._id;
    return devices[_id];
  });
  engine.addFact('$_CURRENT_TIME', function(params, almanac) {
    return new Date();
  });
  engine.addOperator('hourOfTimeBetween', (factValue, jsonValue) => {
    // console.log('hourOfTimeBetween', factValue, jsonValue)
    if (!factValue) return false;
    let date = new Date(factValue);
    let hours = date.getHours();
    return hours > jsonValue[0] && hours <= jsonValue[1];
  });

  /**          fact: 'gameDuration',

   * define the facts
   * note: facts may be loaded asynchronously at runtime; see the advanced example below
   */
  const facts = {
    personalFoulCount: 1,
    gameDuration: 40
  };

  let ret = await engine.run(facts);
  ret.events.map(event => console.log(JSON.stringify(event).red));

  devices['xxxx'] = {
    _id: 'xxxx',
    prop: {
      temperature: 9
    }
  };

  ret = await engine.run(facts);
  ret.events.map(event => console.log(JSON.stringify(event).red));

  devices['xxxx'] = {
    _id: 'xxxx',
    prop: {
      temperature: 19
    }
  };

  ret = await engine.run(facts);
  ret.events.map(event => console.log(JSON.stringify(event).red));

  devices['xxxx'] = {
    _id: 'xxxx',
    prop: {
      temperature: 45
    }
  };

  ret = await engine.run(facts);
  ret.events.map(event => console.log(JSON.stringify(event).red));
}
start();
/*
 * OUTPUT:
 *
 * Player has fouled out!
 */
