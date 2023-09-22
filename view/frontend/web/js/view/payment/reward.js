define(
    [
        'jquery',
        'ko',
        'uiComponent',
        'Magento_Checkout/js/model/quote',
        'Magento_Catalog/js/price-utils',
        'IWD_Opc/js/action/set-use-reward-points',
        'IWD_Opc/js/action/remove-reward-points',
        'Magento_Checkout/js/model/totals'
    ],
    function ($, ko, Component, quote, priceUtils, setUseRewardPointsAction, removeRewardPointsAction, totals) {
        'use strict';

        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/reward'
            },

            isApplied: ko.observable(window.checkoutConfig.payment.reward.amountSubstracted),
            usedAmount: ko.observable(window.checkoutConfig.payment.reward.usedAmount),
            balance: window.checkoutConfig.payment.reward.balance,
            initialize: function () {
                this._super();
                this.isAvailable = ko.computed(function () {
                    if (!window.checkoutConfig.payment.reward.isAvailable) {
                        return false;
                    }

                    if (quote.getTotals()().grand_total === 0) {
                        return this.isApplied();
                    }

                    return true;
                }.bind(this));

                totals.totals.subscribe(function (value) {
                    if (totals.getSegment('reward') && totals.getSegment('reward').value) {
                        var segment = totals.getSegment('reward');
                        this.usedAmount((segment.value * -1));
                    } else {
                        this.isApplied(false);
                        this.usedAmount(0);
                    }
                }.bind(this));
            },
            formatBalance: function () {
                return priceUtils.formatPrice(this.balance, quote.getPriceFormat());
            },
            formatBalanceUsed: function () {
                return priceUtils.formatPrice((this.balance - this.usedAmount()), quote.getPriceFormat());
            },
            cancel: function () {
                $('#iwd_opc_reward [data-role=trigger]').trigger('click');
            },
            useRewardPoints: function () {
                setUseRewardPointsAction(this.usedAmount, this.isApplied);
            },
            remove: function () {
                removeRewardPointsAction(this.usedAmount, this.isApplied);
            }
        });
    }
);
