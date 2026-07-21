define([
    'jquery'
], function ($) {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var quote = deps.quote,
            placeOrderHooks = deps.placeOrderHooks,
            getEmailForQuote = typeof deps.getEmailForQuote === 'function' ? deps.getEmailForQuote : function () { return ''; };

        function clonePaymentPayload(paymentData) {
            if (!paymentData || typeof paymentData !== 'object') {
                return paymentData || {};
            }

            return $.extend(true, {}, paymentData);
        }

        function runRequestModifiers(paymentData, includeBillingAddress, clonePaymentData) {
            var headers = {},
                payload;

            paymentData = clonePaymentData ? clonePaymentPayload(paymentData) : (paymentData || {});
            payload = {
                cartId: quote && typeof quote.getQuoteId === 'function' ? quote.getQuoteId() : null,
                paymentMethod: paymentData
            };

            if (includeBillingAddress === true && quote && typeof quote.billingAddress === 'function') {
                payload.billingAddress = quote.billingAddress();
            }
            if (getEmailForQuote()) {
                payload.email = getEmailForQuote();
            }

            if (placeOrderHooks && Array.isArray(placeOrderHooks.requestModifiers)) {
                placeOrderHooks.requestModifiers.forEach(function (modifier) {
                    if (typeof modifier === 'function') {
                        modifier(headers, payload);
                    }
                });
            }

            return {
                headers: headers,
                payload: payload,
                paymentData: payload.paymentMethod || paymentData || {}
            };
        }

        function buildSyncPayload(paymentData) {
            var payload = {
                cartId: quote && typeof quote.getQuoteId === 'function' ? quote.getQuoteId() : null,
                paymentMethod: paymentData || {}
            };

            if (quote && typeof quote.billingAddress === 'function') {
                payload.billingAddress = quote.billingAddress();
            }
            if (getEmailForQuote()) {
                payload.email = getEmailForQuote();
            }

            return {
                headers: {},
                payload: payload,
                paymentData: paymentData || {}
            };
        }

        function runAfterRequestListeners() {
            if (!placeOrderHooks || !Array.isArray(placeOrderHooks.afterRequestListeners)) {
                return;
            }

            placeOrderHooks.afterRequestListeners.forEach(function (listener) {
                if (typeof listener === 'function') {
                    try {
                        listener();
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: place-order after request listener failed.', e);
                        }
                    }
                }
            });
        }

        function sanitizePayload(value, depth) {
            var result;

            depth = depth || 0;
            if (depth > 6 || value === null || typeof value === 'undefined') {
                return value === undefined ? null : value;
            }
            if (typeof value === 'function') {
                return null;
            }
            if (typeof value !== 'object') {
                return value;
            }
            if (Array.isArray(value)) {
                return value.map(function (item) {
                    return sanitizePayload(item, depth + 1);
                });
            }
            if (value.nodeType || value.window === value) {
                return null;
            }

            result = {};
            Object.keys(value).forEach(function (key) {
                if (key === '__disableTmpl') {
                    return;
                }
                result[key] = sanitizePayload(value[key], depth + 1);
            });

            return result;
        }

        function valuesEqual(a, b) {
            if (a === b) {
                return true;
            }
            if (a == null && b == null) {
                return true;
            }
            if (typeof a === 'object' || typeof b === 'object') {
                try {
                    return JSON.stringify(a || {}) === JSON.stringify(b || {});
                } catch (e) {
                    return false;
                }
            }

            return String(a || '') === String(b || '');
        }

        function getWireProperty(wire, name) {
            if (!wire) {
                return '';
            }
            if (typeof wire.get === 'function') {
                return wire.get(name);
            }
            if (typeof wire[name] !== 'undefined') {
                return wire[name];
            }
            if (wire.data && typeof wire.data[name] !== 'undefined') {
                return wire.data[name];
            }

            return '';
        }

        function setWireIfChanged(wire, field, value, deferUpdate) {
            if (!wire || typeof wire.set !== 'function') {
                return Promise.resolve(false);
            }

            if (valuesEqual(getWireProperty(wire, field), value)) {
                return Promise.resolve(false);
            }

            return Promise.resolve(wire.set(field, value, deferUpdate === true)).then(function () {
                return true;
            });
        }

        function syncHookData(wire, hookData, deferUpdate) {
            var headers,
                payload,
                changed = false;

            if (!wire || typeof wire.set !== 'function') {
                return Promise.resolve(false);
            }

            hookData = hookData || { headers: {}, payload: {} };
            headers = sanitizePayload(hookData.headers || {});
            payload = sanitizePayload(hookData.payload || {});

            return setWireIfChanged(wire, 'placeOrderRequestHeaders', headers, deferUpdate)
                .then(function (didChange) {
                    changed = changed || !!didChange;
                    return setWireIfChanged(wire, 'placeOrderRequestData', payload, deferUpdate);
                })
                .then(function (didChange) {
                    changed = changed || !!didChange;
                    return changed;
                });
        }

        return {
            clonePaymentPayload: clonePaymentPayload,
            runRequestModifiers: runRequestModifiers,
            buildSyncPayload: buildSyncPayload,
            runAfterRequestListeners: runAfterRequestListeners,
            syncHookData: syncHookData
        };
    };
});
