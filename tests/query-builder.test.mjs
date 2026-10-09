import test from "node:test";
import assert from "node:assert/strict";
import { buildQuery, getColumns, getRelations } from "../js/builder.js";
import { lessons, grade } from "../js/lessons.js";

const standard={mode:"aggregate",base:"orders",relation:"",columns:[],dimension:"month",metric:"revenue",status:"",region:"",window:false,drill:"",limit:25};

test("dimension switch changes projection and GROUP BY relationship",()=>{
  const month=buildQuery(standard);
  const region=buildQuery({...standard,dimension:"region"});
  assert.match(month,/DATE_TRUNC/);
  assert.doesNotMatch(month,/JOIN customers/);
  assert.match(region,/LEFT JOIN customers c ON o.customer_id = c.customer_id/);
  assert.match(region,/c.region AS label/);
  assert.match(region,/GROUP BY 1/);
  assert.notEqual(month,region);
});

test("category revenue uses item grain, not duplicated order totals",()=>{
  const sql=buildQuery({...standard,dimension:"category"});
  assert.match(sql,/LEFT JOIN order_items i/);
  assert.match(sql,/LEFT JOIN products p/);
  assert.match(sql,/SUM\(i.quantity \* i.unit_price\)/);
  assert.doesNotMatch(sql,/SUM\(o.total_amount\)/);
});

test("window function choice generates LAG or DENSE_RANK",()=>{
  const month=buildQuery({...standard,window:true});
  const category=buildQuery({...standard,dimension:"category",window:true});
  assert.match(month,/LAG\(value\) OVER/);
  assert.match(category,/DENSE_RANK\(\) OVER/);
});

test("row mode changes SELECT columns and JOIN",()=>{
  const rows={...standard,mode:"rows",base:"orders",relation:"customers",columns:["o.order_id","c.region"],limit:25};
  const sql=buildQuery(rows);
  assert.match(sql,/o.order_id AS o_order_id/);
  assert.match(sql,/c.region AS c_region/);
  assert.match(sql,/LEFT JOIN customers c/);
  assert.match(sql,/LIMIT 25;/);
  assert.equal(getRelations("orders").includes("customers"),true);
  assert.equal(getColumns("orders","customers").some(x=>x.id==="c.region"),true);
});

test("unsupported column identifiers never enter output",()=>{
  const sql=buildQuery({...standard,mode:"rows",columns:["o.order_id","o.order_id; DROP TABLE orders"]});
  assert.doesNotMatch(sql,/DROP TABLE/);
});

test("grading validates rows and schemas, not SQL keyword occurrence",()=>{
  const expected={columns:["a"],rows:[{a:1},{a:2}],total:2};
  const shuffled={columns:["a"],rows:[{a:2},{a:1}],total:2};
  assert.equal(grade(shuffled,expected).passed,true);
  assert.equal(grade(shuffled,expected,true).passed,false);
  assert.equal(grade({columns:["b"],rows:[{b:1}],total:1},expected).passed,false);
});

test("learning path covers SQL fundamentals and advanced concepts",()=>{
  assert.equal(lessons.length,8);
  assert.match(lessons[0].solution,/SELECT \*/);
  assert.match(lessons[5].solution,/INNER JOIN/);
  assert.match(lessons[7].solution,/DENSE_RANK/);
});