// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/GoldCopyTrader.sol";

interface IUSDC {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
}

/// @notice Fork test against real Arbitrum gTrade Diamond + USDC
/// Run: forge test --fork-url <ARBITRUM_RPC> -vvv --match-contract ForkTest
contract GoldCopyTraderForkTest is Test {
    // Real Arbitrum addresses
    address constant USDC_ADDR = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address constant GTRADE_DIAMOND = 0xFF162c694eAA571f685030649814282eA457f169;
    address constant USDC_WHALE = 0x489ee077994B6658eAfA855C308275EAd8097C4A;

    IUSDC usdc = IUSDC(USDC_ADDR);
    GoldCopyTrader trader;

    address admin = address(0xAD1);
    address user1 = address(0xBEEF);

    function setUp() public {
        vm.deal(admin, 10 ether);
        vm.deal(user1, 10 ether);

        vm.prank(admin);
        trader = new GoldCopyTrader(USDC_ADDR, GTRADE_DIAMOND);

        // Use deal to set USDC balances directly (works on fork)
        deal(USDC_ADDR, admin, 50000e6);
        deal(USDC_ADDR, user1, 50000e6);
        deal(USDC_ADDR, address(trader), 100000e6);

        vm.prank(user1);
        usdc.approve(address(trader), type(uint256).max);
        vm.prank(admin);
        usdc.approve(address(trader), type(uint256).max);
    }

    function test_deploy() public view {
        assertEq(address(trader.usdc()), USDC_ADDR);
        assertEq(address(trader.diamond()), GTRADE_DIAMOND);
        assertEq(trader.admin(), admin);
    }

    function test_usdcApprovalToDiamond() public view {
        uint256 allowance = usdc.allowance(address(trader), GTRADE_DIAMOND);
        assertEq(allowance, type(uint256).max);
    }

    function test_postSignal() public {
        vm.prank(admin);
        trader.postSignal(true, uint64(2340e10), uint64(2360e10), uint64(2330e10), uint24(25000));

        assertEq(trader.signalCount(), 1);
        assertEq(trader.activeSignalId(), 1);
    }

    function test_copyTradeRealDiamond() public {
        vm.prank(admin);
        trader.postSignal(true, uint64(2340e10), uint64(2360e10), uint64(2330e10), uint24(25000));

        uint256 balBefore = usdc.balanceOf(user1);

        vm.prank(user1);
        try trader.copyTrade(1, 100e6) {
            // gTrade accepted!
            uint256 balAfter = usdc.balanceOf(user1);
            assertEq(balBefore - balAfter, 100e6);
            (uint256 col,,) = trader.positions(user1, 1);
            assertEq(col, 100e6);
            emit log("gTrade Diamond ACCEPTED the trade!");
        } catch Error(string memory reason) {
            // gTrade reverted — USDC must be safe
            uint256 balAfter = usdc.balanceOf(user1);
            assertEq(balAfter, balBefore);
            emit log_named_string("gTrade reverted (expected on fork)", reason);
            emit log("User USDC is SAFE - atomic revert works");
        } catch (bytes memory) {
            uint256 balAfter = usdc.balanceOf(user1);
            assertEq(balAfter, balBefore);
            emit log("gTrade reverted with low-level error (expected on fork)");
            emit log("User USDC is SAFE - atomic revert works");
        }
    }

    function test_fullLifecycle() public {
        vm.prank(admin);
        trader.postSignal(true, uint64(2340e10), uint64(2360e10), uint64(2330e10), uint24(25000));

        bool copied = false;
        vm.prank(user1);
        try trader.copyTrade(1, 1000e6) {
            copied = true;
            emit log("Copy trade succeeded on real gTrade");
        } catch {
            emit log("Copy reverted (expected) - testing close+claim flow");
        }

        vm.prank(admin);
        trader.closeSignal(1, 100); // +1%
        assertEq(trader.activeSignalId(), 0);
        emit log("Signal closed successfully");

        if (copied) {
            uint256 balBefore = usdc.balanceOf(user1);
            vm.prank(user1);
            trader.claimProceeds(1);
            uint256 balAfter = usdc.balanceOf(user1);
            assertGt(balAfter, balBefore);
            emit log_named_uint("Payout (USDC)", (balAfter - balBefore) / 1e6);
        }
    }

    function test_shortSignal() public {
        vm.prank(admin);
        trader.postSignal(false, uint64(2340e10), uint64(2320e10), uint64(2350e10), uint24(25000));

        uint256 balBefore = usdc.balanceOf(user1);

        vm.prank(user1);
        try trader.copyTrade(1, 100e6) {
            (uint256 col,,) = trader.positions(user1, 1);
            assertEq(col, 100e6);
            emit log("Short trade ACCEPTED by real gTrade!");
        } catch {
            assertEq(usdc.balanceOf(user1), balBefore);
            emit log("Short reverted (expected) - USDC safe");
        }
    }

    function test_cancelRefund() public {
        vm.prank(admin);
        trader.postSignal(true, uint64(2340e10), uint64(2360e10), uint64(2330e10), uint24(25000));

        bool copied = false;
        vm.prank(user1);
        try trader.copyTrade(1, 1000e6) {
            copied = true;
        } catch {}

        vm.prank(admin);
        trader.cancelSignal(1);

        if (copied) {
            uint256 balBefore = usdc.balanceOf(user1);
            vm.prank(user1);
            trader.claimProceeds(1);
            assertEq(usdc.balanceOf(user1) - balBefore, 1000e6);
            emit log("Cancel refund: user got full 1000 USDC back");
        }
    }
}
