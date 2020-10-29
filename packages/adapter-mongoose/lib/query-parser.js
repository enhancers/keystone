const { getType, flatten } = require('@keystonejs/utils');

const { simpleTokenizer, relationshipTokenizer, modifierTokenizer } = require('./tokenizers');

// If it's 0 or 1 items, we can use it as-is. Any more needs an $and/$or
const joinTerms = (matchTerms, joinOp) =>
  matchTerms.length > 1 ? { [joinOp]: matchTerms } : matchTerms[0];

const flattenQueries = (parsedQueries, joinOp) => ({
  matchTerm: joinTerms(
    parsedQueries.map(q => q.matchTerm).filter(matchTerm => matchTerm),
    joinOp
  ),
  postJoinPipeline: flatten(parsedQueries.map(q => q.postJoinPipeline || [])).filter(pipe => pipe),
  relationships: flatten(parsedQueries.map(q => q.relationships || [])),
});

function queryParser({ listAdapter, getUID }, query, pathSoFar = [], include) {
  if (getType(query) !== 'Object') {
    throw new Error(
      `Expected an Object for query, got ${getType(query)} at path ${pathSoFar.join('.')}`
    );
  }
  const excludeFields = listAdapter.fieldAdapters
    .filter(({ isRelationship, field }) => isRelationship && field.config.many)
    .map(({ dbPath }) => dbPath);
  const parsedQueries = Object.entries(query).map(([key, value]) => {
    const path = [...pathSoFar, key];
    if (['AND', 'OR'].includes(key)) {
      return flattenQueries(
        value.map((_query, index) =>
          queryParser({ listAdapter, getUID }, _query, [...path, index])
        ),
        { AND: '$and', OR: '$or' }[key]
      );
    } else if (['$search', '$sortBy', '$orderBy', '$skip', '$first', '$count'].includes(key)) {
      return { postJoinPipeline: [modifierTokenizer(listAdapter, query, key, path)] };
    } else if (key === 'id') {
      if (getType(value) === 'Object') {
        return { matchTerm: { _id: value } };
      } else {
        return { matchTerm: simpleTokenizer(listAdapter, query, key, path) };
      }
    } else if (getType(value) === 'Object') {
      // A relationship query component
      const { matchTerm, relationshipInfo } = relationshipTokenizer(listAdapter, key, path, getUID);

      // Extremely improve mongodb query, using indexes
      if(Object.keys(value).length == 1 && (value.id || value.id_not || value.id_in || value.id_not_in)) {
        //const fieldParser = key.split(/\_(?=[^\_]+$)/);
        const fieldParser = key.split(/(\_some|\_every|\_none)+$/gm);
        const filterType = fieldParser.length > 1 ? fieldParser[1] : '_only';
        let queryCondition = {};
        if(value.id) {
          if(filterType === '_only' || filterType === '_some' || filterType === '_every' ) {
            queryCondition[fieldParser[0]] = {$eq: listAdapter.mongoose.Types.ObjectId(value.id)};
          } else if(filterType === '_none') {
            queryCondition[fieldParser[0]] = {$ne: listAdapter.mongoose.Types.ObjectId(value.id)};
          }
        } else if(value.id_not && (filterType === '_only' || filterType === '_some' || filterType === '_every' || filterType === '_none')) {
          queryCondition[fieldParser[0]] = {$ne: listAdapter.mongoose.Types.ObjectId(value.id_not)};
        } else if(value.id_in && (filterType === '_only' || filterType === '_some')) {
          queryCondition[fieldParser[0]] = {$in: value.id_in.map(el => listAdapter.mongoose.Types.ObjectId(el)) };
        } else if(value.id_not_in && (filterType === '_only' || filterType === '_every')) {
          queryCondition[fieldParser[0]] = {$not: {$in: value.id_not_in.map(el => listAdapter.mongoose.Types.ObjectId(el)) }};
        }
        if(Object.keys(queryCondition).length > 0) {
          return {matchTerm: queryCondition};
        }
      }

      return {
        // matchTerm is our filtering expression. This determines if the
        // parent item is included in the final list
        matchTerm,
        relationships: [{ relationshipInfo, ...queryParser({ listAdapter, getUID }, value, path) }],
      };
    } else {
      // A simple field query component
      return { matchTerm: simpleTokenizer(listAdapter, query, key, path) };
    }
  });
  const flatQueries = flattenQueries(parsedQueries, '$and');
  const includeFields = flatQueries.relationships.map(({ field }) => field);
  if (include) includeFields.push(include);

  return {
    ...flatQueries,
    excludeFields: excludeFields.filter(field => !includeFields.includes(field)),
  };
}

module.exports = { queryParser };
