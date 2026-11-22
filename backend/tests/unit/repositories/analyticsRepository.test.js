import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsRepository } from '../../../repositories/analyticsRepository.js';
import { inspectIndexes, verifyIndexes, REQUIRED_INDEXES } from '../../../config/indexes.js';
import { queryProfiler } from '../../../utils/dbOptimizer.js';

test('search rejects malformed and unsafe filters before any database call', async () => {
  const repository=createAnalyticsRepository({ query:()=>assert.fail('Invalid input reached database') });
  for(const filters of [{sortBy:'constructor'},{sortBy:['price']},{sortOrder:'desc; select 1'}, {limit:0},{offset:-1},{make:['Honda']},{year:'2020x'},{minPrice:'1e5'},{minPrice:5,maxPrice:1}]) {
    await assert.rejects(repository.searchInventory(filters),error=>error.code==='INVALID_QUERY');
  }
  await assert.rejects(repository.availability(1,'2026-02-30','09:00-10:00'),error=>error.code==='INVALID_QUERY');
});
test('search binds literal input and maps pg rows; no string interpolation of user text', async () => {
  const input="' OR 1=1 --";
  let query;
  const repository=createAnalyticsRepository({ async query(sql,values) { query={sql,values}; return {rows:[{total:'1',data:[{id:1,price:'12500.25',make:'Honda',fuel_type:'Hybrid'}]}]}; } });
  const result=await repository.searchInventory({make:input,sortBy:'year',sortOrder:'desc',limit:'5',offset:'1'});
  assert.equal(query.sql.includes(input),false);
  assert.deepEqual(query.values,[input,5,1]);
  assert.match(query.sql,/ORDER BY year DESC NULLS LAST, id ASC/);
  assert.equal(result.data[0].price,12500.25); assert.equal(result.data[0].fuelType,'Hybrid');
  assert.equal(result.total,1);
});
test('missing authoritative sources are unavailable without database queries', () => {
  const repository=createAnalyticsRepository({query:()=>assert.fail('No source exists')});
  assert.equal(repository.revenueMetrics().totalRevenue,null);
  assert.equal(repository.searchMetrics().available,false);
});
test('index verification reads real catalog state and fails closed for missing indexes', async () => {
  const adapter={async query(sql,params) {
    assert.match(sql,/^SELECT/); assert.deepEqual(params,[REQUIRED_INDEXES]);
    return {rows:REQUIRED_INDEXES.slice(1).map(indexname=>({indexname}))};
  }};
  assert.deepEqual(await inspectIndexes(adapter),{verified:false,missing:[REQUIRED_INDEXES[0]]});
  await assert.rejects(verifyIndexes(adapter),error=>error.code==='INDEXES_MISSING');
});
test('profiling counts operations without retaining or exposing parameters', async () => {
  queryProfiler.resetLogs();
  const result=await queryProfiler.profileQuery('test_operation',async value=>value,['sensitive-parameter']);
  assert.equal(result.result,'sensitive-parameter');
  assert.equal(Object.hasOwn(result.logEntry,'params'),false);
  await assert.rejects(queryProfiler.profileQuery('test_failure',async()=>{throw new Error('expected');}));
  const stats=queryProfiler.getStats(); assert.equal(stats.totalQueries,2); assert.equal(stats.errorQueries,1);
  assert.doesNotMatch(JSON.stringify(stats),/sensitive-parameter/);
});
