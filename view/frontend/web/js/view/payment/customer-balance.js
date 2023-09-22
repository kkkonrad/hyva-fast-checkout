define(
    [
        'jquery',
        'ko',
        'uiComponent',
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/model/totals',
        'Magento_Catalog/js/price-utils',
        'IWD_Opc/js/action/use-balance',
        'IWD_Opc/js/action/remove-balance'
    ],
    function ($, ko, component, quote, totals, priceUtils, useBalanceAction, removeBalanceAction) {

        return component.extend({
            defaults: {
                template: 'IWD_Opc/payment/customer-balance'
            },

            isApplied: ko.observable(window.checkoutConfig.payment.customerBalance.amountSubstracted), //isCustomerBalanceUsed
            usedAmount: ko.observable(window.checkoutConfig.payment.customerBalance.usedAmount),
            balance: window.checkoutConfig.payment.customerBalance.balance,
            initialize: function () {
                this._super();
                this.isAvailable = ko.computed(function () {
                    if (!window.checkoutConfig.payment.customerBalance.isAvailable) {
                        return false;
                    }

                    if (quote.getTotals()().grand_total === 0) {
                        return this.isApplied();
                    }

                    return true;
                }.bind(this));

                totals.totals.subscribe(function (value) {
                    if (totals.getSegment('customerbalance') || totals.getSegment('storecredit')) {
                        var segment = totals.getSegment('customerbalance') || totals.getSegment('storecredit');
                        this.usedAmount((segment.value * -1));
                    } else {
                        this.usedAmount(window.checkoutConfig.payment.customerBalance.balance);
                    }
                }.bind(this));
            },
            /**
             * Format customer balance
             *
             * @return {string}
             */
            formatBalance: function () {
                return priceUtils.formatPrice(this.balance, quote.getPriceFormat());
            },
            formatBalanceUsed: function () {
                return priceUtils.formatPrice((this.balance - this.usedAmount()), quote.getPriceFormat());
            },
            /**
             * Send request to use balance
             */
            sendRequest: function () {
                useBalanceAction(this.usedAmount, this.isApplied);
            },
            remove: function () {
                removeBalanceAction(this.usedAmount, this.isApplied);
            },
            cancel: function () {
                $('#iwd_opc_store_credit [data-role=trigger]').trigger('click');
            }
        });
    }
);
