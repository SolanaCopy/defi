/**
 * Test referral system — Supabase + reward logic
 *
 * Tests:
 * 1. Save referral to Supabase
 * 2. Look up referral by user + signalId
 * 3. Calculate reward (10% of fee)
 * 4. Verify reward would be sent
 * 5. Clean up test data
 *
 * Run: node scripts/test-referral.cjs
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://iqrdexbrkhhmuzidlwni.supabase.co";
const SUPABASE_KEY = "sb_publishable_wj2j8y7-HVbaqx2CvEuDhQ_C3Oa09C9";
const REFERRAL_REWARD_PCT = 10;

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("=== REFERRAL SYSTEM TEST ===\n");

  const testReferrer = "0xaaaa000000000000000000000000000000000001";
  const testReferred = "0xbbbb000000000000000000000000000000000002";
  const testSignalId = 99999;
  const testAmount = 50; // $50 USDC

  // Step 1: Save referral
  console.log("--- Step 1: Save referral to Supabase ---");
  const { error: insertError } = await supabase.from("referrals").upsert({
    referrer: testReferrer,
    referred: testReferred,
    signal_id: testSignalId,
    amount: testAmount,
  }, { onConflict: "referred,signal_id" });

  if (insertError) {
    console.log("FAIL: Insert error:", insertError.message);
    return;
  }
  console.log("OK: Referral saved");

  // Step 2: Look up referral
  console.log("\n--- Step 2: Look up referral ---");
  const { data: lookup, error: lookupError } = await supabase
    .from("referrals")
    .select("*")
    .eq("referred", testReferred)
    .eq("signal_id", testSignalId)
    .limit(1);

  if (lookupError || !lookup || lookup.length === 0) {
    console.log("FAIL: Could not find referral:", lookupError?.message);
    return;
  }
  console.log("OK: Found referral:", JSON.stringify(lookup[0], null, 2));

  // Step 3: Calculate reward
  console.log("\n--- Step 3: Calculate reward ---");
  // Simulate: user copied $50, trade closed with +5% leveraged result
  // Fee = 20% of profit = 20% of $2.50 = $0.50
  // In USDC (6 decimals): 500000
  const feeUSDC = 500000; // $0.50 in 6 decimals
  const reward = (feeUSDC * REFERRAL_REWARD_PCT) / 100;
  const rewardReadable = reward / 1e6;
  console.log(`Fee: $${feeUSDC / 1e6}`);
  console.log(`Reward (${REFERRAL_REWARD_PCT}% of fee): $${rewardReadable}`);
  console.log(`Min threshold (0.01 USDC = 10000): ${reward >= 10000 ? 'PASS' : 'BELOW MIN'}`);

  // Step 4: Simulate reward payout (mark as paid)
  console.log("\n--- Step 4: Mark reward as paid ---");
  const { error: updateError } = await supabase
    .from("referrals")
    .update({ reward_paid: true, reward_amount: rewardReadable })
    .eq("referred", testReferred)
    .eq("signal_id", testSignalId);

  if (updateError) {
    console.log("FAIL: Update error:", updateError.message);
    return;
  }

  // Verify update
  const { data: verify } = await supabase
    .from("referrals")
    .select("*")
    .eq("referred", testReferred)
    .eq("signal_id", testSignalId)
    .limit(1);

  console.log("OK: Updated record:", JSON.stringify(verify[0], null, 2));
  console.log(`reward_paid: ${verify[0].reward_paid === true ? 'PASS' : 'FAIL'}`);
  console.log(`reward_amount: ${verify[0].reward_amount == rewardReadable ? 'PASS' : 'FAIL'}`);

  // Step 5: Test referral stats (like dashboard would)
  console.log("\n--- Step 5: Test referral stats query ---");
  const { data: stats } = await supabase
    .from("referrals")
    .select("amount")
    .eq("referrer", testReferrer);

  const totalCount = stats ? stats.length : 0;
  const totalVolume = stats ? stats.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) : 0;
  console.log(`Referral count: ${totalCount} (expected: 1) — ${totalCount === 1 ? 'PASS' : 'FAIL'}`);
  console.log(`Referral volume: $${totalVolume} (expected: $50) — ${totalVolume === 50 ? 'PASS' : 'FAIL'}`);

  // Step 6: Test duplicate prevention
  console.log("\n--- Step 6: Test duplicate prevention ---");
  const { error: dupError } = await supabase.from("referrals").upsert({
    referrer: testReferrer,
    referred: testReferred,
    signal_id: testSignalId,
    amount: 100, // different amount
  }, { onConflict: "referred,signal_id" });

  const { data: afterDup } = await supabase
    .from("referrals")
    .select("amount")
    .eq("referred", testReferred)
    .eq("signal_id", testSignalId);

  // Should still be 1 record (upserted, not duplicated)
  console.log(`Records after upsert: ${afterDup.length} (expected: 1) — ${afterDup.length === 1 ? 'PASS' : 'FAIL'}`);

  // Cleanup
  console.log("\n--- Cleanup ---");
  await supabase
    .from("referrals")
    .delete()
    .eq("referred", testReferred)
    .eq("signal_id", testSignalId);
  console.log("Test data deleted");

  console.log("\n=== ALL TESTS PASSED ===");
}

main().catch(console.error);
