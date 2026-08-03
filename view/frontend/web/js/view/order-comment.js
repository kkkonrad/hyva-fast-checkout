/**
 * Order comment field for Fastcheckout.
 * Magento core has no storefront checkout comment component; this follows
 * Magento_Ui form field patterns so place-order can read the textarea DOM.
 *
 * Labels come from PHP (data-* on the mount root / component config) so
 * Magento i18n CSV (pl_PL etc.) applies — KO $t() only works for strings
 * present in js-translation.json, which often misses module phrases.
 */
define([
    'ko',
    'uiComponent'
], function (ko, Component) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/hyva/order-comment',
            comment: '',
            label: 'Order Comment',
            placeholder: 'Optional comment for this order'
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
            var root;

            this._super();

            // Prefer data attributes on the mount node (translated in PHP).
            root = document.getElementById('fastcheckout-ko-comment-root');
            if (root) {
                if (root.getAttribute('data-label')) {
                    this.label = root.getAttribute('data-label');
                }
                if (root.getAttribute('data-placeholder')) {
                    this.placeholder = root.getAttribute('data-placeholder');
                }
            }

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
