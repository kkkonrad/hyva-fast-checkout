define([
    'ko',
    'uiComponent',
    'Magento_Checkout/js/model/shipping-service',
    'Magento_Checkout/js/action/select-shipping-method',
    'Magento_Checkout/js/model/quote',
    'Magento_Catalog/js/price-utils'
], function (ko, Component, shippingService, selectShippingMethodAction, quote, priceUtils) {
    'use strict';

    function isInPostModuleAvailable() {
        var context, paths, map;

        if (typeof require === 'undefined' || typeof require.s === 'undefined') {
            return false;
        }

        try {
            if (typeof require.defined === 'function' && require.defined('inPostPaczkomaty')) {
                return true;
            }
            if (typeof require.specified === 'function' && require.specified('inPostPaczkomaty')) {
                return true;
            }
        } catch (e) {
            // Ignore RequireJS introspection errors.
        }

        context = require.s.contexts && require.s.contexts._;
        if (!context || !context.config) {
            return false;
        }

        paths = context.config.paths || {};
        map = context.config.map || {};

        if (paths.inPostPaczkomaty) {
            return true;
        }

        // Mapped aliases (e.g. '*': { inPostPaczkomaty: '...' })
        if (map['*'] && map['*'].inPostPaczkomaty) {
            return true;
        }

        return false;
    }

    function renderInPostWidget() {
        // Smartmage InPost is optional. Skip when the module is not registered to
        // avoid RequireJS 404 + MIME "text/plain" console errors on Hyvä.
        if (!isInPostModuleAvailable()) {
            return;
        }

        require(
            [
                'inPostPaczkomaty',
                'Magento_Checkout/js/model/full-screen-loader'
            ],
            function (inPostPaczkomaty, fullScreenLoader) {
                if (!inPostPaczkomaty || typeof inPostPaczkomaty.renderInPostData !== 'function') {
                    return;
                }

                setTimeout(function () {
                    inPostPaczkomaty.renderInPostData()
                        .then(function () {
                            return inPostPaczkomaty.insertLogoInPost();
                        })
                        .then(function () {
                            fullScreenLoader.stopLoader();
                        })
                        .catch(function () {
                            fullScreenLoader.stopLoader();
                        });
                }, 100);
            },
            function () {
                // Module path exists but failed to load — fail silently.
            }
        );
    }

    // Capture trusted radio interaction before Knockout checked-write runs.
    // KO rebinds on rates() refresh also call write(), without a real click.
    if (!window.fastcheckoutShippingClickCaptureBound) {
        window.fastcheckoutShippingClickCaptureBound = true;
        window.fastcheckoutLastTrustedShippingClick = null;
        function captureTrustedShippingChoice(event) {
            var target = event.target,
                code,
                shipping,
                rates,
                found = null,
                applied;

            if (
                !event.isTrusted ||
                !target ||
                target.name !== 'shipping_method' ||
                !target.value
            ) {
                return;
            }

            // Radio fires click then change — only handle once per gesture.
            // Headless analysis: dual listeners caused 2x remember + 2x Magewire push per click.
            if (event.type === 'change') {
                return;
            }

            code = String(target.value);
            applied = window.fastcheckoutLastTrustedShippingApplied;
            if (
                applied &&
                applied.code === code &&
                (Date.now() - applied.at) < 500
            ) {
                return;
            }

            window.fastcheckoutLastTrustedShippingClick = {
                code: code,
                at: Date.now()
            };

            shipping = window.fastcheckoutHyvaShipping;

            // Headless analysis: if we only lock here, KO pureComputed read() already
            // returns the new lock and write() never runs — quote/Magewire stay on the
            // previous rate. Apply selection immediately from the trusted click path.
            if (shipping && typeof shipping.rememberUserShippingSelection === 'function') {
                shipping.rememberUserShippingSelection(code);
            }

            // Shipping remap may change allowed payments — drop payment lock so server
            // auto-select is not blocked by the previous payment choice.
            if (
                window.fastcheckoutHyvaPayment &&
                typeof window.fastcheckoutHyvaPayment.clearUserPaymentSelection === 'function'
            ) {
                window.fastcheckoutHyvaPayment.clearUserPaymentSelection();
            } else if (
                window.fastcheckoutHyvaPaymentMethodSync &&
                typeof window.fastcheckoutHyvaPaymentMethodSync.clearUserPaymentSelection === 'function'
            ) {
                window.fastcheckoutHyvaPaymentMethodSync.clearUserPaymentSelection();
            }

            rates = shippingService.getShippingRates()() || [];
            rates.some(function (rate) {
                if (rate && (rate.carrier_code + '_' + rate.method_code) === code) {
                    found = rate;
                    return true;
                }
                return false;
            });

            if (!found) {
                var parts = code.split('_'),
                    carrier = parts.shift() || '';
                found = {
                    carrier_code: carrier,
                    method_code: parts.length ? parts.join('_') : carrier,
                    carrier_title: '',
                    method_title: '',
                    amount: 0
                };
            }

            // Suppress bridge onSelect side-effects from this intentional apply; we sync below.
            // Also lock the rates list so Magewire payment remap cannot flash a reload.
            window.fastcheckoutSuppressShippingSync = true;
            window.fastcheckoutLockShippingRatesList = true;
            window.fastcheckoutSelectingShippingMethod = true;
            try {
                selectShippingMethodAction(found);
            } finally {
                window.fastcheckoutSuppressShippingSync = false;
            }

            if (shipping && typeof shipping.syncShippingMethodToMagewireNow === 'function') {
                shipping.syncShippingMethodToMagewireNow(code);
            } else if (shipping && typeof shipping.syncShippingMethodToMagewire === 'function') {
                shipping.syncShippingMethodToMagewire(code);
            }

            // Mark write path as already handled for this click (avoid double Magewire push).
            window.fastcheckoutLastTrustedShippingApplied = {
                code: code,
                at: Date.now()
            };

            // Force KO css/radio recompute — shipping lock is plain JS, not observable.
            if (
                window.fastcheckoutHyvaShippingListInstance &&
                typeof window.fastcheckoutHyvaShippingListInstance.bumpSelectionRevision === 'function'
            ) {
                window.fastcheckoutHyvaShippingListInstance.bumpSelectionRevision();
            }
        }

        // click only — change is ignored (see above) to prevent double apply
        document.addEventListener('click', captureTrustedShippingChoice, true);
    }

    return Component.extend({
        defaults: {
            template: 'Kkkonrad_Fastcheckout/hyva/shipping-list'
        },

        rates: shippingService.getShippingRates(),
        isLoading: shippingService.isLoading,

        splitMethodCode: function (value) {
            var parts = String(value || '').split('_'),
                carrier = parts.shift() || '';

            return {
                carrier_code: carrier,
                method_code: parts.length ? parts.join('_') : carrier
            };
        },

        isTrustedShippingWrite: function (value) {
            var click = window.fastcheckoutLastTrustedShippingClick;

            return !!(
                click &&
                click.code === String(value || '') &&
                (Date.now() - click.at) < 750
            );
        },

        initObservable: function () {
            var self = this;
            this._super().observe({
                errorMethodCode: '',
                errorValidationMessage: ''
            });

            // Pure computed so <!-- ko if: hasGeneralError --> re-renders when message changes.
            this.hasGeneralError = ko.pureComputed(function () {
                var err = self.errorMethodCode(),
                    msg = self.errorValidationMessage();

                return !!(msg && (!err || err === 'general' || err === '_'));
            });

            // Plain JS shipping lock is not a KO observable — without this revision the
            // css: getMethodCss() binding never re-runs and border-blue-500 sticks on the
            // previous rate after a switch (radio can still look correct via native click).
            this.selectionRevision = ko.observable(0);
            this.bumpSelectionRevision = function () {
                self.selectionRevision(self.selectionRevision() + 1);
            };

            this.selectedMethodCode = ko.pureComputed({
                read: function () {
                    var shipping = window.fastcheckoutHyvaShipping,
                        userMethod,
                        active;

                    // Establish a KO dependency so lock/quote changes refresh radios + borders.
                    self.selectionRevision();

                    // Prefer the shopper's fresh choice so KO radio rebinds after rates()
                    // refresh do not flash the previous rate.
                    if (
                        shipping &&
                        typeof shipping.isUserShippingSelectionFresh === 'function' &&
                        shipping.isUserShippingSelectionFresh() &&
                        typeof shipping.getUserSelectedShippingMethod === 'function'
                    ) {
                        userMethod = shipping.getUserSelectedShippingMethod();
                        if (userMethod) {
                            return userMethod;
                        }
                    }

                    active = quote.shippingMethod();
                    if (!active) {
                        var checkedDomRadio = document.querySelector('input[name="shipping_method"]:checked');
                        return checkedDomRadio ? checkedDomRadio.value : null;
                    }
                    return active.carrier_code + '_' + active.method_code;
                },
                write: function (value) {
                    var rates,
                        found = null,
                        shipping = window.fastcheckoutHyvaShipping,
                        isUserGesture = self.isTrustedShippingWrite(value),
                        alreadyApplied = window.fastcheckoutLastTrustedShippingApplied,
                        appliedRecently = !!(
                            alreadyApplied &&
                            alreadyApplied.code === String(value || '') &&
                            (Date.now() - alreadyApplied.at) < 750
                        );

                    if (!value) {
                        return;
                    }

                    // Trusted click handler already applied quote + Magewire — skip double push.
                    if (appliedRecently) {
                        return;
                    }

                    // Knockout re-binds radio `checked` when rates() is replaced. That fires
                    // write(oldRate) without a real click and was bouncing shipping methods.
                    if (
                        !isUserGesture &&
                        shipping &&
                        typeof shipping.shouldIgnoreKnockoutApply === 'function' &&
                        shipping.shouldIgnoreKnockoutApply(value)
                    ) {
                        return;
                    }

                    if (self && typeof self.clearError === 'function') {
                        self.clearError();
                    }
                    rates = shippingService.getShippingRates()();
                    rates.some(function (rate) {
                        var c1 = rate.carrier_code + '_' + rate.method_code;
                        var c2 = rate.method_code + '_' + rate.carrier_code;
                        if (c1 === value || c2 === value || rate.carrier_code === value || rate.method_code === value) {
                            found = rate;
                            return true;
                        }
                        return false;
                    });

                    if (!found) {
                        var parsed = self.splitMethodCode(value);
                        found = {
                            carrier_code: parsed.carrier_code,
                            method_code: parsed.method_code,
                            carrier_title: '',
                            method_title: '',
                            amount: 0
                        };
                    }

                    if (
                        isUserGesture &&
                        shipping &&
                        typeof shipping.rememberUserShippingSelection === 'function'
                    ) {
                        shipping.rememberUserShippingSelection(value);
                    } else if (
                        shipping &&
                        typeof shipping.rememberUserShippingSelection === 'function' &&
                        (
                            !shipping.getUserSelectedShippingMethod ||
                            !shipping.getUserSelectedShippingMethod()
                        )
                    ) {
                        shipping.rememberUserShippingSelection(value);
                    }

                    selectShippingMethodAction(found);
                    if (typeof self.bumpSelectionRevision === 'function') {
                        self.bumpSelectionRevision();
                    }

                    if (
                        shipping &&
                        typeof shipping.syncShippingMethodToMagewireNow === 'function'
                    ) {
                        shipping.syncShippingMethodToMagewireNow(value);
                        return;
                    }

                    if (
                        shipping &&
                        typeof shipping.syncShippingMethodToMagewire === 'function'
                    ) {
                        shipping.syncShippingMethodToMagewire(value);
                    }
                }
            }, this);

            return this;
        },

        initialize: function () {
            var self = this;

            this._super();
            window.fastcheckoutHyvaShippingListInstance = this;

            // Initial rates are populated before this component subscribes to
            // shippingService, so initialize carrier widgets explicitly once.
            renderInPostWidget();

            // Re-render InPost widget when shipping rates change (e.g. on payment method switch)
            shippingService.getShippingRates().subscribe(function () {
                renderInPostWidget();
                if (typeof self.bumpSelectionRevision === 'function') {
                    self.bumpSelectionRevision();
                }
            });

            // Re-render InPost widget when shipping method changes
            quote.shippingMethod.subscribe(function () {
                renderInPostWidget();
                if (typeof self.bumpSelectionRevision === 'function') {
                    self.bumpSelectionRevision();
                }
            });
            
            return this;
        },

        setError: function (methodCode, message) {
            var self = this.errorMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            if (self._errorTimer) {
                clearTimeout(self._errorTimer);
                self._errorTimer = null;
            }
            if (typeof self.errorMethodCode === 'function') {
                // Empty / "general" = list-level message (e.g. no method selected).
                self.errorMethodCode(methodCode || 'general');
                self.errorValidationMessage(message || '');
            }

            self._errorTimer = setTimeout(function () {
                self.clearError();
            }, 8000);
        },

        clearError: function () {
            var self = this.errorMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            if (self._errorTimer) {
                clearTimeout(self._errorTimer);
                self._errorTimer = null;
            }
            if (typeof self.errorMethodCode === 'function') {
                self.errorMethodCode('');
                self.errorValidationMessage('');
            }
        },

        hasError: function (method) {
            var self = this.errorMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            var fullCode = method.carrier_code + '_' + method.method_code;
            var altCode = method.method_code + '_' + method.carrier_code;
            var err = (typeof self.errorMethodCode === 'function') ? self.errorMethodCode() : '';

            // General errors are rendered once under the whole list, not per rate.
            if (!err || err === 'general' || err === '_') {
                return false;
            }

            return err === fullCode || err === altCode;
        },

        /**
         * Single source of truth for the blue border / radio highlight.
         * Prefer selectedMethodCode (user lock → quote → DOM). Never OR quote with a
         * different lock — that left border-blue-500 on the previous rate after switch.
         */
        getPreferredSelectedCode: function () {
            var self = this.selectedMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this),
                currentSelected,
                active,
                checked;

            // Keep css:getMethodCss reactive when only the non-KO lock changed.
            if (typeof self.selectionRevision === 'function') {
                self.selectionRevision();
            }

            if (typeof self.selectedMethodCode === 'function') {
                currentSelected = self.selectedMethodCode();
                if (currentSelected) {
                    return String(currentSelected);
                }
            }

            active = quote.shippingMethod();
            if (active && active.carrier_code && active.method_code) {
                return active.carrier_code + '_' + active.method_code;
            }

            checked = document.querySelector('input[name="shipping_method"]:checked');
            return checked && checked.value ? String(checked.value) : '';
        },

        methodMatchesCode: function (method, code) {
            var fullCode,
                altCode;

            if (!method || !code) {
                return false;
            }

            fullCode = method.carrier_code + '_' + method.method_code;
            altCode = method.method_code + '_' + method.carrier_code;
            code = String(code);

            return code === fullCode || code === altCode;
        },

        getMethodCss: function (method) {
            var self = this.selectedMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this),
                preferred = self.getPreferredSelectedCode ? self.getPreferredSelectedCode() : '',
                isSelected = self.methodMatchesCode
                    ? self.methodMatchesCode(method, preferred)
                    : false,
                hasErr = self.hasError ? self.hasError(method) : false;

            if (hasErr) {
                return 'border-2 border-red-400 bg-red-50/10';
            }
            if (isSelected) {
                return 'border-2 border-blue-500 bg-blue-50/10 shadow-sm';
            }
            return 'border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50/50';
        },

        isSelectedVal: function (method) {
            var self = this.selectedMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this),
                preferred = self.getPreferredSelectedCode ? self.getPreferredSelectedCode() : '';

            return self.methodMatchesCode
                ? self.methodMatchesCode(method, preferred)
                : false;
        },

        selectShippingMethod: function (method) {
            var self = this.selectedMethodCode ? this : (window.fastcheckoutHyvaShippingListInstance || this);
            if (method && typeof self.selectedMethodCode === 'function') {
                self.selectedMethodCode(method.carrier_code + '_' + method.method_code);
            }
            return true;
        },

        formatPrice: function (price) {
            return priceUtils.formatPrice(price, quote.getPriceFormat());
        }
    });
});
