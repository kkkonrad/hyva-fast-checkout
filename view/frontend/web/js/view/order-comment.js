/**
 * Order comment field for Fastcheckout.
 * Magento core has no storefront checkout comment component; this follows
 * Magento_Ui form field patterns so place-order can read the textarea DOM.
 */
define([
    'ko',
    'uiComponent',
    'jquery'
], function (ko, Component, $) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/hyva/order-comment',
            comment: ''
        },

        /**
         * @returns {Object}
         */
        initObservable: function () {
            this._super()
                .observe(['comment']);

            return this;
        },

        /**
         * @returns {Object}
         */
        initialize: function () {
            this._super();

            // Keep a window-level mirror for place-order extras without relying
            // only on KO bindings if the DOM is re-rendered mid-flow.
            this.comment.subscribe(function (value) {
                try {
                    window.fastcheckoutOrderComment = String(value || '');
                } catch (e) {
                    // ignore
                }
            });

            return this;
        },

        /**
         * @returns {String}
         */
        getComment: function () {
            return String(this.comment() || '');
        }
    });
});
