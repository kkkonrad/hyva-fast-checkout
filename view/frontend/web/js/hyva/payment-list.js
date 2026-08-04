define([
    'underscore',
    'Magento_Checkout/js/view/payment/list',
    'Magento_Checkout/js/model/payment/method-list'
], function (_, PaymentList, paymentMethods) {
    'use strict';

    /**
     * Soft-remove keeps third-party renderers (PayU Secure Forms, hosted fields)
     * alive when Magento temporarily drops a method from method-list (shipping
     * change, free method, totals refresh). Hard destroy + recreate breaks SDKs.
     *
     * Soft-hidden renderers stay in the KO region; only DOM visibility changes.
     * When the method returns, restoreRenderer unhides without re-running layout().
     */
    return PaymentList.extend({
        initialize: function () {
            this.pendingRendererCodes = this.pendingRendererCodes || {};
            this.softRemovedMethods = this.softRemovedMethods || {};
            this._super();
            window.fastcheckoutHyvaPaymentList = this;

            // Core already reacts to arrayChange (create/remove). This pass keeps
            // soft-removed slots in sync when Magento only mutates the list.
            paymentMethods.subscribe(function () {
                this.syncRenderers();
            }, this, 'arrayChange');

            return this;
        },

        createRenderer: function (paymentMethodData) {
            var methodCode = paymentMethodData && paymentMethodData.method
                ? String(paymentMethodData.method)
                : '';

            if (!methodCode) {
                return;
            }

            if (this.softRemovedMethods[methodCode]) {
                this.restoreRenderer(methodCode);

                return;
            }

            if (this.hasRenderer(methodCode) || this.pendingRendererCodes[methodCode]) {
                return;
            }

            this.pendingRendererCodes[methodCode] = true;
            this._super(paymentMethodData);

            window.setTimeout(function () {
                delete this.pendingRendererCodes[methodCode];
            }.bind(this), 0);
        },

        methodCodesEqual: function (rendererCode, paymentMethodCode) {
            rendererCode = rendererCode ? String(rendererCode) : '';
            paymentMethodCode = paymentMethodCode ? String(paymentMethodCode) : '';

            return rendererCode !== '' && rendererCode === paymentMethodCode;
        },

        /**
         * @param {String} paymentMethodCode
         * @param {Boolean} [includeSoftRemoved=true]
         * @returns {Boolean}
         */
        hasRenderer: function (paymentMethodCode, includeSoftRemoved) {
            var found = false;

            if (includeSoftRemoved !== false && this.softRemovedMethods[paymentMethodCode]) {
                return true;
            }

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
         * @param {String} paymentMethodCode
         * @returns {Array}
         */
        findRenderers: function (paymentMethodDataOrCode) {
            var code = typeof paymentMethodDataOrCode === 'object' && paymentMethodDataOrCode
                    ? String(paymentMethodDataOrCode.method || '')
                    : String(paymentMethodDataOrCode || ''),
                matches = [];

            if (!code) {
                return matches;
            }

            _.each(this.paymentGroupsList(), function (group) {
                _.each(this.getRegion(group.displayArea)(), function (value) {
                    if (value.item && this.methodCodesEqual(value.item.method, code)) {
                        matches.push(value);
                    }
                }, this);
            }, this);

            return matches;
        },

        /**
         * Hide Magento .payment-method nodes and FC host slots for a method.
         *
         * @param {String} code
         * @param {Boolean} hide
         */
        setMethodDomHidden: function (code, hide) {
            var safe = String(code || '').replace(/"/g, '');

            if (!safe) {
                return;
            }

            document.querySelectorAll('.payment-method').forEach(function (node) {
                var radio = node.querySelector(
                        'input[name="payment[method]"], input[type="radio"][value]'
                    ),
                    match = false;

                if (radio && String(radio.value || '') === safe) {
                    match = true;
                }
                if (!match && node.getAttribute('id') === safe) {
                    match = true;
                }
                if (!match) {
                    return;
                }

                if (hide) {
                    node.setAttribute('data-fastcheckout-soft-removed', '1');
                    node.classList.remove('_active');
                    node.removeAttribute('data-fastcheckout-active');
                    node.style.display = 'none';
                    node.setAttribute('aria-hidden', 'true');
                } else if (node.getAttribute('data-fastcheckout-soft-removed') === '1') {
                    node.removeAttribute('data-fastcheckout-soft-removed');
                    node.style.display = '';
                    node.removeAttribute('aria-hidden');
                }
            });

            document.querySelectorAll(
                '[data-fastcheckout-payment-method-ko-target="' + safe + '"]'
            ).forEach(function (slot) {
                if (hide) {
                    slot.setAttribute('data-fastcheckout-soft-removed', '1');
                    slot.classList.add('hidden');
                    slot.style.display = 'none';
                } else {
                    slot.removeAttribute('data-fastcheckout-soft-removed');
                    // Stay collapsed until the shopper selects this method again.
                    slot.classList.add('hidden');
                    slot.style.display = 'none';
                }
            });
        },

        /**
         * Soft-hide renderer nodes without dispose/destroy (SDK-safe).
         *
         * @param {String} paymentMethodCode
         * @returns {Object}
         */
        removeRenderer: function (paymentMethodCode) {
            var code = paymentMethodCode ? String(paymentMethodCode) : '';

            if (!code) {
                return this;
            }

            this.softRemovedMethods[code] = true;
            this.setMethodDomHidden(code, true);

            return this;
        },

        /**
         * Undo soft remove when Magento re-adds the method to method-list.
         *
         * @param {String} paymentMethodCode
         * @returns {Object}
         */
        restoreRenderer: function (paymentMethodCode) {
            var code = paymentMethodCode ? String(paymentMethodCode) : '';

            if (!code || !this.softRemovedMethods[code]) {
                return this;
            }

            delete this.softRemovedMethods[code];
            this.setMethodDomHidden(code, false);

            return this;
        },

        /**
         * Align renderers with Magento method-list: create/restore present methods,
         * soft-remove methods that disappeared.
         *
         * @returns {Object}
         */
        syncRenderers: function () {
            var available = {},
                self = this;

            _.each(paymentMethods(), function (paymentMethodData) {
                var code = paymentMethodData && paymentMethodData.method
                    ? String(paymentMethodData.method)
                    : '';

                if (!code) {
                    return;
                }
                available[code] = paymentMethodData;

                if (self.softRemovedMethods[code]) {
                    self.restoreRenderer(code);
                } else if (!self.hasRenderer(code) && !self.pendingRendererCodes[code]) {
                    self.createRenderer(paymentMethodData);
                }
            });

            _.each(Object.keys(this.softRemovedMethods), function (code) {
                // keep map honest for methods still soft-removed
                if (available[code]) {
                    return;
                }
            });

            _.each(this.paymentGroupsList(), function (group) {
                _.each(this.getRegion(group.displayArea)(), function (value) {
                    var code = value && value.item ? String(value.item.method || '') : '';

                    if (code && !available[code] && !this.softRemovedMethods[code]) {
                        this.removeRenderer(code);
                    }
                }, this);
            }, this);

            return this;
        }
    });
});
