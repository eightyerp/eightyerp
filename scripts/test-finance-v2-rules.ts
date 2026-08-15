import assert from "node:assert/strict";
import {
  calculateCompanyRetainedMargin,
  calculateEstimatedBaseSettlement,
  calculateExpectedSettlementPayable,
} from "../lib/crm/settlement-preview-rules";

const interiorOdd = calculateEstimatedBaseSettlement({
  businessUnit: "interior",
  revenueAmount: 20_000_000,
  marginAmount: 10_000_001,
});
assert.equal(interiorOdd.baseSettlementAmount, 5_000_000);
assert.equal(interiorOdd.rate, 0.5);
assert.equal(interiorOdd.isProxy, false);

const interiorLoss = calculateEstimatedBaseSettlement({
  businessUnit: "interior",
  revenueAmount: 20_000_000,
  marginAmount: -3_000_000,
});
assert.equal(interiorLoss.baseSettlementAmount, 0);

const window = calculateEstimatedBaseSettlement({
  businessUnit: "window",
  revenueAmount: 100_000_000,
  marginAmount: 15_000_000,
});
assert.equal(window.baseSettlementAmount, 2_000_000);
assert.equal(window.rate, 0.02);
assert.equal(window.isProxy, true);

const payable = calculateExpectedSettlementPayable({
  baseSettlementAmount: 5_000_000,
  additionalIncentiveAmount: 200_000,
  deductionAmount: 100_000,
  paidAmount: 1_000_000,
});
assert.equal(payable, 4_100_000);

const clampedPayable = calculateExpectedSettlementPayable({
  baseSettlementAmount: 1_000_000,
  additionalIncentiveAmount: 0,
  deductionAmount: 2_000_000,
  paidAmount: 0,
});
assert.equal(clampedPayable, 0);

const retained = calculateCompanyRetainedMargin({
  contributionMargin: 10_000_001,
  baseSettlementAmount: interiorOdd.baseSettlementAmount,
});
assert.equal(retained, 5_000_001);

console.log("Finance V2 settlement rule tests: PASS");
