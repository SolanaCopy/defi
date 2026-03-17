// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../GoldCopyTrader.sol";

/// @notice Mock of gTrade Diamond for testing — records calls instead of executing real trades
contract MockDiamond {
    struct TradeCall {
        address user;
        uint16 pairIndex;
        uint24 leverage;
        bool long;
        uint120 collateralAmount;
        uint64 openPrice;
    }

    TradeCall[] public trades;
    bool public shouldRevert;

    function setShouldRevert(bool _revert) external {
        shouldRevert = _revert;
    }

    function openTrade(
        IGNSMultiCollatDiamond.Trade calldata trade,
        uint16 /*maxSlippageP*/,
        address /*referrer*/
    ) external {
        require(!shouldRevert, "MockDiamond: forced revert");
        trades.push(TradeCall({
            user: trade.user,
            pairIndex: trade.pairIndex,
            leverage: trade.leverage,
            long: trade.long,
            collateralAmount: trade.collateralAmount,
            openPrice: trade.openPrice
        }));
    }

    function closeTradeMarket(uint32 /*index*/, uint64 /*expectedPrice*/) external pure {
        // no-op for mock
    }

    function getTradeCount() external view returns (uint256) {
        return trades.length;
    }
}
