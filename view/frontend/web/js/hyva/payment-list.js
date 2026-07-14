define([
    'underscore',
    'Magento_Checkout/js/view/payment/list',
    'Magento_Checkout/js/model/payment/method-list'
], function (_, PaymentList, paymentMethods) {
    'use strict';

    return PaymentList.extend({
        initialize: function () {
            this.pendingRendererCodes = this.pendingRendererCodes || {};
            this._super();
            window.fastcheckoutHyvaPaymentList = this;

            paymentMethods.subscribe(function (changes) {
                this.syncRenderers();
            }, this, 'arrayChange');

            return this;
        },

        createRenderer: function (paymentMethodData) {
            if (this.hasRenderer(paymentMethodData.method) || this.pendingRendererCodes[paymentMethodData.method]) {
                return;
            }

            this.pendingRendererCodes[paymentMethodData.method] = true;
            this._super(paymentMethodData);

            window.setTimeout(function () {
                delete this.pendingRendererCodes[paymentMethodData.method];
            }.bind(this), 0);
        },

        methodCodesEqual: function (rendererCode, paymentMethodCode) {
            rendererCode = rendererCode ? String(rendererCode) : '';
            paymentMethodCode = paymentMethodCode ? String(paymentMethodCode) : '';

            return rendererCode !== '' && rendererCode === paymentMethodCode;
        },

        hasRenderer: function (paymentMethodCode) {
            var found = false;

            _.each(this.paymentGroupsList(), function (group) {
                _.each(this.getRegion(group.displayArea)(), function (value) {
                    if (value.item && this.methodCodesEqual(value.item.method, paymentMethodCode)) {
                        found = true;
                    }
                }, this);
            }, this);

            return found;
        },

        /**
         * Keep stateful third-party renderers alive when a shipping/payment
         * rule temporarily removes their method. Hosted fields (for example
         * PayU Secure Forms) cannot be safely destroyed and initialized again
         * against the same checkout DOM.
         *
         * @returns {Object}
         */
        removeRenderer: function () {
            return this;
        },

        syncRenderers: function () {
            _.each(paymentMethods(), function (paymentMethodData) {
                if (!this.hasRenderer(paymentMethodData.method) && !this.pendingRendererCodes[paymentMethodData.method]) {
                    this.createRenderer(paymentMethodData);
                }
            }, this);
        }
    });
});
