import { test } from "node:test";
import assert from "node:assert/strict";
import { netProfit } from "../src/lib/calc.js";

test("netProfit formula matches spec", () => {
  const r = netProfit({
    gross_pay: 1200,
    broker_fee: 120,
    fuel_cost: 250,
    tolls: 0,
    maintenance_cost: 0,
    other_costs: 15,
  });
  // 1200 - (120+250+0+0+15) = 815
  assert.equal(r, 815);
});

test("netProfit handles zeros and missing fields", () => {
  assert.equal(netProfit({ gross_pay: 0 }), 0);
  assert.equal(netProfit({ gross_pay: 100, other_costs: 100.001 }), 0); // rounding
});
