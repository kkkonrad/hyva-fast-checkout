define(
    [
        'jquery',
        'ko',
        'uiComponent',
        'IWD_Opc/js/action/set-gift-card-information',
        'Magento_GiftCardAccount/js/action/remove-gift-card-from-quote',
        'Magento_Checkout/js/model/totals',
        'Magento_Checkout/js/model/quote',
        'Magento_Catalog/js/price-utils',
        'mage/translate',
        'Magento_GiftCardAccount/js/model/payment/gift-card-messages',
        'mage/validation'
    ],
    function ($,
              ko,
              Component,
              setGiftCardAction,
              removeGiftCardAction,
              totals,
              quote,
              priceUtils,
              $t,
              messageList) {
        "use strict";
        return Component.extend({
            defaults: {
                template: 'IWD_Opc/payment/gift-card-account',
                giftCardCode: ko.observable('')
            },
            isGiftCardsUsed: window.checkoutConfig.payment.giftCardAccount.hasUsage,
            giftCards: ko.observableArray([]),
            isShowGiftCardForm: ko.observable(false),
            initialize: function () {
                this._super();

                this.giftCardsCodes = ko.computed(function () {
                    if (this.giftCards().length) {
                        return this.giftCards().length > 1 ? $t('Multiple') : this.giftCards()[0].c;
                    } else {
                        return '';
                    }
                }.bind(this));

                totals.totals.subscribe(function (value) {
                    var giftCardAccountSegment = totals.getSegment('giftcardaccount');
                    if (giftCardAccountSegment) {
                        var giftCards = JSON.parse(giftCardAccountSegment.extension_attributes.gift_cards);
                        this.giftCards(giftCards);
                    } else {
                        this.giftCards([]);
                    }
                }.bind(this));

                return this;
            },
            getCardBalance: function (card) {
                return priceUtils.formatPrice(card.oa, quote.getPriceFormat());
            },
            getNewCardBalance: function (card) {
                return priceUtils.formatPrice(card.oa - card.a, quote.getPriceFormat());
            },
            apply: function () {
                if (this.validate()) {
                    setGiftCardAction([this.giftCardCode()]).done(function (response) {
                        if (response) {
                            this.giftCardCode('');
                            this.isShowGiftCardForm(false);
                        }
                    }.bind(this));
                }
            },
            remove: function (giftCardCode) {
                messageList.clear();
                removeGiftCardAction(giftCardCode);
            },
            addAnother: function () {
                this.isShowGiftCardForm(true);
            },
            hideAnother: function () {
                this.isShowGiftCardForm(false);
            },
            cancel: function () {
                $('#iwd_opc_gift_card [data-role=trigger]').trigger('click');
            },
            validate: function () {
                var form = '#giftcard-form';
                return $(form).validation() && $(form).validation('isValid');
            }
        })
    }
);
