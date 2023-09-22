define(
    [
        'Magento_GiftMessage/js/model/url-builder',
        'mage/storage',
        'Magento_Ui/js/model/messageList',
        'Magento_Checkout/js/model/error-processor',
        'mage/url',
        'Magento_Checkout/js/model/quote',
        'Magento_Checkout/js/model/cart/totals-processor/default'
    ],
    function (urlBuilder, storage, messageList, errorProcessor, url, quote, totalsDefaultProvider) {
        'use strict';
        var totalsProcessors = [];

        return function (itemId, data, options) {
            var serviceUrl;

            url.setBaseUrl(options.baseUrl);

            if (options.isCustomerLoggedIn) {
                serviceUrl = urlBuilder.createUrl('/carts/mine/gift-message', {});
                if (itemId !== 'orderLevel') {
                    serviceUrl = urlBuilder.createUrl('/carts/mine/gift-message/:itemId', {
                        itemId: itemId
                    });
                }
            } else {
                serviceUrl = urlBuilder.createUrl('/guest-carts/:cartId/gift-message', {
                    cartId: quote.getQuoteId()
                });
                if (itemId !== 'orderLevel') {
                    serviceUrl = urlBuilder.createUrl(
                        '/guest-carts/:cartId/gift-message/:itemId',
                        {
                            cartId: quote.getQuoteId(), itemId: itemId
                        }
                    );
                }
            }
            totalsProcessors['default'] = totalsDefaultProvider;

            messageList.clear();
            return storage.post(
                serviceUrl,
                JSON.stringify({
                    gift_message: data
                })
            ).done(
                function (response) {
                    var type = quote.shippingAddress().getType();
                    totalsProcessors[type]
                        ? totalsProcessors[type].estimateTotals(quote.shippingAddress())
                        : totalsProcessors['default'].estimateTotals(quote.shippingAddress());
                }
            ).fail(
                function (response) {
                    errorProcessor.process(response);
                }
            );
        };
    }
);
