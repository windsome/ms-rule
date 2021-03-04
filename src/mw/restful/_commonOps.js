export function firstOfRetrieve(result, model) {
  if (!result) return null;
  if (!result.result) return null;
  if (!result.entities) return null;

  // result.items[0]存在则直接返回.
  let item = result.items && result.items[0];
  if (item) return item;

  // result.result[0]存在则从entities中获取.
  let itemId = result.result[0];
  if (!itemId) return null;

  if (model) {
    item = result.entities[model] && result.entities[model][itemId];
    if (item) return item;
  }

  let collections = Object.getOwnPropertyNames(result.entities);
  for (let i = 0; i < collections.length; i++) {
    let collectionName = collections[i];
    let collection = result.entities[collectionName];
    item = collection && collection[itemId];
    if (item) return item;
  }
  return null;
}

export function itemListOfRetrieve(result, model) {
  if (!result) return [];
  if (!result.result) return [];
  if (!result.entities) return [];

  let item0Id = result.result[0];
  if (!item0Id) return [];

  let dbEntites = null;
  if (model) {
    dbEntites = result.entities[model];
  } else {
    let collections = Object.getOwnPropertyNames(result.entities);
    for (let i = 0; i < collections.length; i++) {
      let collectionName = collections[i];
      let collection = result.entities[collectionName];
      if (i == 0) dbEntites = collection;
      if (collection && collection[item0Id]) {
        // 第0个在此collection中,找到目标entities.
        dbEntites = collection;
        break;
      }
    }
  }

  return result.result.map(id => {
    return dbEntites[id];
  });
}
