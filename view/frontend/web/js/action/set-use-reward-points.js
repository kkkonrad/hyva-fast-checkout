define(
    [
        'jquery',
        'Magento_Checkout/js/model/url-builder',
        'mage/storage',
        'Magento_Checkout/js/model/error-processor',
        'Magento_Ui/js/model/messageList',
        'mage/translate',
        'Magento_Checkout/js/model/full-screen-loader',
        'Magento_Checkout/js/action/get-payment-information',
        'Magento_Checkout/js/model/totals'
    ],
    function ($,
              urlBuilder,
              storage,
              errorProcessor,
              messageList,
              $t,
              fullScreenLoader,
              getPaymentInformationAction,
              totals) {
        'use strict';
        return function (usedAmount, isApplied) {
            var message = $t('Your reward points were successfully applied');
            messageList.clear();
            fullScreenLoader.startLoader();
            storage.post(
                urlBuilder.createUrl('/reward/mine/use-reward', {}), {}
            ).done(
                function (response) {
                    if (response) {
                        var deferred = $.Deferred();
                        totals.isLoading(true);
                        getPaymentInformationAction(deferred);
                        $.when(deferred).done(function () {
                            totals.isLoading(false);
                            if (totals.getSegment('reward')) {
                                usedAmount((totals.getSegment('reward').value * -1));
                            } else {
                                usedAmount(window.checkoutConfig.payment.reward.balance);
                            }

                            isApplied(true);
                            fullScreenLoader.stopLoader();
                        });
                        messageList.addSuccessMessage({'message': message});
                    } else {
                        fullScreenLoader.stopLoader();
                    }
                }
            ).fail(
                function (response) {
                    totals.isLoading(false);
                    errorProcessor.process(response);
                    fullScreenLoader.stopLoader();
                }
            );
        };
    }
);
