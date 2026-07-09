define([
    'jquery'
], function ($) {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var config = deps.config || {},
            quote = deps.quote,
            checkoutTotals = deps.checkoutTotals;

        function normalize(totalsData) {
            var data = $.extend(true, {}, totalsData || {}),
                quoteItems = (window.checkoutConfig && window.checkoutConfig.quoteItemData) ||
                    (config.checkoutConfig && config.checkoutConfig.quoteItemData) ||
                    [];

            if (!Array.isArray(data.items)) {
                data.items = quoteItems;
            }
            if (!Array.isArray(data.total_segments)) {
                data.total_segments = [];
            }
            ['subtotal', 'grand_total', 'shipping_amount', 'tax_amount', 'discount_amount'].forEach(function (code) {
                if (typeof data[code] === 'undefined' || data[code] === null || data[code] === '') {
                    data[code] = 0;
                }
                data[code] = parseFloat(data[code]) || 0;
            });
            if (typeof data.subtotal_with_discount === 'undefined' || data.subtotal_with_discount === null || data.subtotal_with_discount === '') {
                data.subtotal_with_discount = data.subtotal + (parseFloat(data.discount_amount) || 0);
            }
            data.subtotal_with_discount = parseFloat(data.subtotal_with_discount) || data.subtotal || 0;

            return data;
        }

        function getConfigTotalsData() {
            if (window.checkoutConfig && window.checkoutConfig.totalsData) {
                return window.checkoutConfig.totalsData;
            }
            if (config.checkoutConfig && config.checkoutConfig.totalsData) {
                return config.checkoutConfig.totalsData;
            }

            return null;
        }

        function readFromDom() {
            var rows = document.querySelectorAll('[data-fastcheckout-total-row]'),
                currentTotals = quote && typeof quote.totals === 'function' ? quote.totals() : null,
                data,
                segmentsByCode = {};

            if (!rows.length) {
                return null;
            }

            data = normalize(currentTotals || getConfigTotalsData());
            data.total_segments.forEach(function (segment) {
                if (segment && segment.code) {
                    segmentsByCode[segment.code] = segment;
                }
            });

            rows.forEach(function (row) {
                var code = row.getAttribute('data-code'),
                    label = row.getAttribute('data-label') || code,
                    value = parseFloat(row.getAttribute('data-value'));

                if (!code || isNaN(value)) {
                    return;
                }

                data[code] = value;
                if (!segmentsByCode[code]) {
                    segmentsByCode[code] = {
                        code: code
                    };
                    data.total_segments.push(segmentsByCode[code]);
                }
                segmentsByCode[code].title = label;
                segmentsByCode[code].value = value;
            });

            return normalize(data);
        }

        function sync(totalsData) {
            var data = normalize(totalsData);

            if (!quote || typeof quote.setTotals !== 'function') {
                return false;
            }

            quote.setTotals(data);
            if (window.checkoutConfig) {
                window.checkoutConfig.totalsData = data;
            }
            if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                checkoutTotals.isLoading(false);
            }

            return true;
        }

        function syncFromConfig() {
            var totalsData = getConfigTotalsData();

            if (!totalsData) {
                return false;
            }

            return sync(totalsData);
        }

        function syncFromDom() {
            var totalsData = readFromDom();

            if (!totalsData) {
                return false;
            }

            return sync(totalsData);
        }

        return {
            normalize: normalize,
            getConfigTotalsData: getConfigTotalsData,
            readFromDom: readFromDom,
            sync: sync,
            syncFromConfig: syncFromConfig,
            syncFromDom: syncFromDom
        };
    };
});
