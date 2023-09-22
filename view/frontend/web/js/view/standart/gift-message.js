define([
    'ko',
    'jquery',
    'uiComponent',
    'mage/translate',
    'underscore',
    'Magento_Checkout/js/model/quote',
    'Magento_Catalog/js/price-utils',
    'IWD_Opc/js/action/gift-message',
    'iwdOpcHelper'
], function (ko, $, Component, $t, _, quote, priceUtils, giftMessageAction) {
    'use strict';
    var giftOptionsConfig = window.giftOptionsConfig ? window.giftOptionsConfig : null;

    var giftWrappingConfig = giftOptionsConfig ?
        giftOptionsConfig.giftWrapping :
        window.checkoutConfig.giftWrapping;

    var giftMessageConfig = giftOptionsConfig ? giftOptionsConfig.giftMessage : null;

    return Component.extend({
        defaults: {
            template: 'IWD_Opc/standart/gift-message'
        },

        isLoading: ko.observable(false),
        saveMessageDelay: 1800,
        saveMessageTimeouts: [],

        optionsRenderCallback: [],

        decorateSelect: function (uid) {
            if (typeof(this.optionsRenderCallback[uid]) !== 'undefined') {
                clearTimeout(this.optionsRenderCallback[uid]);
            }

            this.optionsRenderCallback[uid] = setTimeout(function () {
                var select = $('#' + uid);
                if (select.length) {
                    select.decorateSelect();
                }
            }, 0);
        },

        initialize: function () {
            var self = this;
            this._super();

            if (giftWrappingConfig) {
                this.isAllowPrintedCard = ko.observable(!!giftWrappingConfig.isAllowPrintedCard);
                this.isAllowGiftReceipt = ko.observable(!!giftWrappingConfig.isAllowGiftReceipt);
                this.isGiftReceiptUsed = ko.observable(giftWrappingConfig.appliedGiftReceipt === '1');
                this.isPrintedCardUsed = ko.observable(giftWrappingConfig.appliedPrintedCard === '1');
                this.giftWrapForOrder = ko.observable(giftWrappingConfig.appliedWrapping.orderLevel);
                this.giftWrapForItems = (!!giftWrappingConfig.appliedWrapping.itemLevel) ? giftWrappingConfig.appliedWrapping.itemLevel : false;
            }


            var isUsedForOrderLevel = giftMessageConfig && giftMessageConfig.hasOwnProperty('orderLevel');
            if (isUsedForOrderLevel) {
                if (giftMessageConfig.orderLevel.gift_message_id) {
                    isUsedForOrderLevel = true;
                } else if (giftWrappingConfig) {
                    isUsedForOrderLevel = this.isGiftReceiptUsed() || this.isPrintedCardUsed() || this.giftWrapForOrder();
                } else {
                    isUsedForOrderLevel = false;
                }
            }

            this.isUsedForOrderLevel = ko.observable(isUsedForOrderLevel);
            this.isUsedForOrderLevel.subscribe(function (value) {
                self.saveGiftMessage('orderLevel', value);
            });

            var isUsedForItemsLevel = false;
            if (giftMessageConfig.hasOwnProperty('itemLevel')) {
                isUsedForItemsLevel = !!_.find(giftMessageConfig.itemLevel, function (item) {
                    return item.hasOwnProperty('message') && item.message.gift_message_id;
                });
            }

            if (!isUsedForItemsLevel && giftWrappingConfig) {
                isUsedForItemsLevel = this.giftWrapForItems;
            }

            this.isUsedForItemsLevel = ko.observable(isUsedForItemsLevel);
            this.isUsedForItemsLevel.subscribe(function (value) {
                _.each(self.getGiftMessageItems(), function (item) {
                    if (self.isUsedForItemLevel[item.id]()) {
                        self.saveGiftMessage(item.id, value);
                    }
                });
            });
            this.isUsedForCheckout = ko.observable(isUsedForOrderLevel || isUsedForItemsLevel);

            this.isUsedForItemLevel = {};
            _.each(this.getGiftMessageItems(), function (item) {
                var isUsedForItem = !!item.message;
                if (!isUsedForItem && giftWrappingConfig) {
                    isUsedForItem = !!self.giftWrapForItems[item.id];
                }

                self.isUsedForItemLevel[item.id] = ko.observable(isUsedForItem);
                self.isUsedForItemLevel[item.id].subscribe(function (value) {
                    self.saveGiftMessage(item.id, value);
                });
            });

            this.bindGiftMessageFields();
        },

        giftWrapForItem: function (itemId) {
            return (!!giftWrappingConfig.appliedWrapping.itemLevel) ? giftWrappingConfig.appliedWrapping.itemLevel[itemId] : false;
        },

        bindGiftMessageFields: function () {
            var self = this;
            $(document).on('input change', '#iwd_opc_gift_message form input, #iwd_opc_gift_message form select, #iwd_opc_gift_message form textarea', function (e) {
                self.saveGiftMessage($(this).closest('form').attr('data-iwd-gm-id'));
            });
        },

        saveGiftMessage: function (itemId, save) {
            var self = this;
            if (typeof (save) === 'undefined') {
                save = true;
            }

            if (typeof(self.saveMessageTimeouts[itemId]) !== 'undefined') {
                clearTimeout(self.saveMessageTimeouts[itemId]);
            }

            self.saveMessageTimeouts[itemId] = setTimeout(function () {
                var data = self.prepareData(itemId, save);
                self.isLoading(true);
                giftMessageAction(itemId, data, giftOptionsConfig).always(function () {
                    self.isLoading(false);
                })
            }, self.saveMessageDelay);
        },

        prepareData: function (itemId, save) {
            var form = $('#iwd_opc_gift_message form[data-iwd-gm-id=' + itemId + ']');
            var data = form.serializeAssoc();
            if (!save) {
                data = this.resetData(data);
            } else {
                if (typeof(data.extension_attributes) !== 'undefined') {
                    _.each(data.extension_attributes, function (value, index) {
                        if (value === 'on') {
                            data.extension_attributes[index] = true;
                        } else if (value === '') {
                            delete data.extension_attributes[index];
                        }
                    });
                }
            }

            return data;
        },

        resetData: function (data) {
            var self = this;
            _.each(data, function (value, index) {
                if (index === 'extension_attributes') {
                    _.each(value, function (extV, extIndex) {
                        if (extV === 'on') {
                            value[extIndex] = false;
                        } else {
                            value[extIndex] = null;
                        }

                        data[index] = value;
                    });
                } else {
                    if (typeof(data[index]) === 'boolean') {
                        data[index] = false;
                    } else {
                        data[index] = null;
                    }
                }
            });

            return data;
        },

        getGiftMessageItems: function () {
            var items = [];
            var _this = this;
            _.each(giftMessageConfig.itemLevel, function (item, index) {
                if ((item.hasOwnProperty('is_available') && item.is_available) || giftOptionsConfig.isItemLevelGiftOptionsEnabled) {
                    var quoteItem = _.find(quote.getItems(), function (quoteItem) {
                        return quoteItem.item_id === index;
                    });
                    if (quoteItem) {
                        var itemData = {
                            name: quoteItem.name,
                            id: quoteItem.item_id,
                            message: item.message
                        };
                        items.push(itemData);
                    }
                }
            });

            return items;
        },

        getValue: function (key, itemId) {
            var giftMessageValue = '';
            if (!itemId) {
                if (giftMessageConfig.orderLevel.hasOwnProperty('gift_message_id')) {
                    return giftMessageConfig.orderLevel[key];
                }
            } else {
                if (giftMessageConfig.itemLevel[itemId].hasOwnProperty('message') && giftMessageConfig.itemLevel[itemId].message.hasOwnProperty('gift_message_id')) {
                    return giftMessageConfig.itemLevel[itemId].message[key];
                }
            }

            return giftMessageValue;
        },

        textareaAutoSize: function (element) {
            $(element).textareaAutoSize();
        },

        isGiftMessageAvailableForOrder: function () {
            return false;
            return giftOptionsConfig && giftOptionsConfig.isOrderLevelGiftOptionsEnabled;
        },

        isGiftMessageAvailableForItems: function () {
            return false;
            var isGloballyAvailable,
                availableItem = false;

            isGloballyAvailable = giftOptionsConfig && giftOptionsConfig.isItemLevelGiftOptionsEnabled;
            if (giftMessageConfig.hasOwnProperty('itemLevel')) {
                availableItem = _.find(giftMessageConfig.itemLevel, function (item) {
                    return item.is_available === true;
                });
            }

            return availableItem || isGloballyAvailable;
        },

        getPrintedCardPrice: function () {
            var price = '';
            var priceInclTax = giftWrappingConfig.cardInfo.hasOwnProperty('price_incl_tax') ?
                giftWrappingConfig.cardInfo.price_incl_tax
                : giftWrappingConfig.cardInfo.price;
            var priceExclTax = giftWrappingConfig.cardInfo.hasOwnProperty('price_excl_tax') ?
                giftWrappingConfig.cardInfo.price_excl_tax
                : giftWrappingConfig.cardInfo.price;
            var priceFormat = giftOptionsConfig.priceFormat;
            if (giftWrappingConfig.displayCardBothPrices) {
                price = priceUtils.formatPrice(
                    priceExclTax,
                    priceFormat
                );
                price += ' (' + priceUtils.formatPrice(
                    priceInclTax,
                    priceFormat
                ) + ')';
            } else {
                price = priceUtils.formatPrice(
                    giftWrappingConfig.cardInfo.price,
                    priceFormat
                );
            }

            return price;
        },

        isWrappingAvailableForOrder: function () {
            return giftWrappingConfig && giftWrappingConfig.allowForOrder
                && (this.getWrappingItems().length > 0
                    || this.isAllowGiftReceipt()
                    || this.isAllowPrintedCard()
                );
        },

        isWrappingAvailableForItems: function (cartItemId) {
            return giftWrappingConfig && giftWrappingConfig.allowForItems
                && this.getWrappingItems(cartItemId).length > 0;
        },

        getWrappingItems: function (cartItemId) {
            return _.map(giftWrappingConfig.designsInfo, function (item, id) {
                var cartItemsConfig = giftWrappingConfig.itemsInfo || {},
                    price = 0,
                    priceExclTax = 0,
                    priceInclTax = 0,
                    cartItemConfig = null;

                if (cartItemId &&
                    cartItemsConfig[cartItemId] &&
                    (cartItemsConfig[cartItemId].hasOwnProperty('price') ||
                        cartItemsConfig[cartItemId].hasOwnProperty('price_excl_tax') ||
                        cartItemsConfig[cartItemId].hasOwnProperty('price_incl_tax'))
                ) {
                    cartItemConfig = cartItemsConfig[cartItemId];
                    price = cartItemConfig.price;
                    priceExclTax = cartItemConfig.hasOwnProperty('price_excl_tax') ?
                        cartItemConfig['price_excl_tax'] :
                        price;
                    priceInclTax = cartItemConfig.hasOwnProperty('price_incl_tax') ?
                        cartItemConfig['price_incl_tax'] :
                        price;
                } else {
                    price = item.price;
                    priceExclTax = item.hasOwnProperty('price_excl_tax') ? item['price_excl_tax'] : price;
                    priceInclTax = item.hasOwnProperty('price_incl_tax') ? item['price_incl_tax'] : price;
                }

                var priceFormat = giftOptionsConfig.priceFormat;
                if (giftWrappingConfig.displayWrappingBothPrices) {
                    price = priceUtils.formatPrice(
                        priceExclTax,
                        priceFormat
                    );
                    price += ' (' + priceUtils.formatPrice(
                        priceInclTax,
                        priceFormat
                    ) + ')';
                } else {
                    price = priceUtils.formatPrice(
                        price,
                        priceFormat
                    );
                }

                return {
                    'id': id,
                    'label': item.label,
                    'path': item.path,
                    'price': price,
                    'priceExclTax': priceExclTax,
                    'priceInclTax': priceInclTax
                };
            });
        }
    });
});
