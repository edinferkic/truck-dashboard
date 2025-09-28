export function netProfit({
  gross_pay,
  broker_fee = 0,
  fuel_cost = 0,
  tolls = 0,
  maintenance_cost = 0,
  other_costs = 0,
}) {
  const gp = Number(gross_pay || 0);
  const sum =
    Number(broker_fee || 0) +
    Number(fuel_cost || 0) +
    Number(tolls || 0) +
    Number(maintenance_cost || 0) +
    Number(other_costs || 0);

  const v = Number((gp - sum).toFixed(2));
  // Normalize -0 to 0 for clean display/comparisons
  return Object.is(v, -0) ? 0 : v;
}
