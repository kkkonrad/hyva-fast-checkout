define([
    'jquery'
], function ($) {
    'use strict';

    function getAddressValue(address, camelKey, snakeKey) {
        var value;

        if (!address) {
            return undefined;
        }

        value = address[camelKey];
        if (typeof value === 'undefined' && snakeKey) {
            value = address[snakeKey];
        }
        if (typeof value === 'function') {
            value = value();
        }

        return value;
    }

    function mergeAddressObjectValues() {
        var result = {};

        Array.prototype.slice.call(arguments).forEach(function (value) {
            if (value && typeof value === 'object') {
                $.extend(true, result, value);
            }
        });

        return result;
    }

    function normalizeAddressCustomAttributes(attributes) {
        var result = [];

        if (!attributes) {
            return result;
        }

        if (Array.isArray(attributes)) {
            attributes.forEach(function (attribute) {
                if (attribute && typeof attribute === 'object' && attribute.attribute_code) {
                    result.push({
                        attribute_code: attribute.attribute_code,
                        value: attribute.value
                    });
                }
            });
            return result;
        }

        if (typeof attributes === 'object') {
            Object.keys(attributes).forEach(function (key) {
                var value = attributes[key];
                if (value && typeof value === 'object' && value.attribute_code) {
                    result.push({
                        attribute_code: value.attribute_code,
                        value: value.value
                    });
                } else {
                    result.push({
                        attribute_code: key,
                        value: value
                    });
                }
            });
        }

        return result;
    }

    function normalizeAddressAttributeMap(attributes) {
        var result = {};

        normalizeAddressCustomAttributes(attributes).forEach(function (attribute) {
            if (attribute && attribute.attribute_code) {
                result[attribute.attribute_code] = attribute.value;
            }
        });

        return result;
    }

    function getAddressAttributes(address, camelKey, snakeKey) {
        if (!address) {
            return {};
        }

        return mergeAddressObjectValues(
            getAddressValue(address, snakeKey),
            getAddressValue(address, camelKey)
        );
    }

    function parseFieldPath(name) {
        var parts;

        if (!name || typeof name !== 'string') {
            return [];
        }

        if (name.indexOf('[') !== -1) {
            parts = name.replace(/\]/g, '').split('[');
        } else {
            parts = name.split('.');
        }

        return parts.filter(function (part) {
            return part !== '';
        });
    }

    function setPathValue(target, path, value) {
        var cursor = target,
            key,
            existing;

        if (!target || !Array.isArray(path) || !path.length) {
            return;
        }

        while (path.length > 1) {
            key = path.shift();
            if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
                cursor[key] = {};
            }
            cursor = cursor[key];
        }

        key = path.shift();
        existing = cursor[key];
        if (typeof existing === 'undefined') {
            cursor[key] = value;
            return;
        }

        if (Array.isArray(existing)) {
            existing.push(value);
            return;
        }

        cursor[key] = [existing, value];
    }

    function getFieldValue(element) {
        var tagName,
            selected = [];

        if (!element || element.disabled) {
            return undefined;
        }

        tagName = String(element.tagName || '').toLowerCase();
        if (tagName === 'button' || element.type === 'button' || element.type === 'submit' || element.type === 'file') {
            return undefined;
        }

        if (element.type === 'checkbox') {
            return element.checked ? (element.value || true) : undefined;
        }

        if (element.type === 'radio') {
            return element.checked ? element.value : undefined;
        }

        if (tagName === 'select' && element.multiple) {
            Array.prototype.slice.call(element.options || []).forEach(function (option) {
                if (option.selected) {
                    selected.push(option.value);
                }
            });
            return selected;
        }

        if (typeof element.value !== 'undefined') {
            return element.value;
        }

        return undefined;
    }

    function getDatasetPath(element, keys) {
        var i,
            value;

        if (!element || !element.dataset) {
            return '';
        }

        for (i = 0; i < keys.length; i++) {
            value = element.dataset[keys[i]];
            if (value) {
                return value;
            }
        }

        return '';
    }

    function isKnownPaymentAdditionalField(field) {
        return [
            'accept_tos',
            'terms_accept',
            'group',
            'groupId',
            'group_id',
            'channel',
            'channelId',
            'channel_id',
            'blik_code',
            'blikCode',
            'blik_alias',
            'blikAlias',
            'saveAlias',
            'regulation_accept',
            'regulationAccept',
            'method',
            'methodId',
            'method_id',
            'statement',
            'standalone',
            'payment_method_nonce',
            'device_data',
            'public_hash',
            'payments_order_id',
            'payment_source',
            'cardBin',
            'holderName',
            'cardLast4',
            'cardExpiryMonth',
            'cardExpiryYear',
            'selected_issuer',
            'selected_terminal',
            'card_token',
            'mollie_save_card',
            'mollie_mandate_id',
            'mollie_consent_timestamp',
            'applepay_payment_token',
            'limited_methods',
            'card_data',
            'cardData',
            'card_save',
            'cardSave',
            'card_id',
            'cardId',
            'savedId',
            'card_vendor',
            'cardVendor',
            'card_short_code',
            'cardShortCode',
            'short_code',
            'shortCode',
            'sessionId',
            'session_id',
            'refId',
            'ref_id',
            'cardType',
            'card_type',
            'cardDate',
            'card_date',
            'cardMask',
            'card_mask'
        ].indexOf(field) !== -1;
    }

    function collectStructuredFields(roots, options) {
        var result = {
                additionalData: {},
                extensionAttributes: {},
                customAttributes: {},
                topLevel: {}
            },
            mode,
            selector = [
                'input[name]',
                'select[name]',
                'textarea[name]',
                '[data-fastcheckout-payment-additional-field]',
                '[data-fastcheckout-additional-field]',
                '[data-fastcheckout-payment-extension-field]',
                '[data-fastcheckout-extension-field]',
                '[data-fastcheckout-shipping-custom-field]',
                '[data-fastcheckout-custom-field]',
                '[data-fastcheckout-shipping-extension-field]'
            ].join(',');

        options = options || {};
        mode = options.mode || '';

        roots.forEach(function (root) {
            if (!root || typeof root.querySelectorAll !== 'function') {
                return;
            }

            Array.prototype.slice.call(root.querySelectorAll(selector)).forEach(function (element) {
                var value = getFieldValue(element),
                    name = element.getAttribute('name') || '',
                    path = parseFieldPath(name),
                    explicitAdditionalPath,
                    explicitExtensionPath,
                    explicitCustomPath,
                    first,
                    second;

                if (typeof value === 'undefined') {
                    return;
                }

                explicitAdditionalPath = getDatasetPath(element, [
                    'fastcheckoutPaymentAdditionalField',
                    'fastcheckoutAdditionalField'
                ]);
                explicitExtensionPath = getDatasetPath(element, [
                    'fastcheckoutPaymentExtensionField',
                    'fastcheckoutShippingExtensionField',
                    'fastcheckoutExtensionField'
                ]);
                explicitCustomPath = getDatasetPath(element, [
                    'fastcheckoutShippingCustomField',
                    'fastcheckoutCustomField'
                ]);

                if (explicitAdditionalPath && mode !== 'shipping') {
                    setPathValue(result.additionalData, parseFieldPath(explicitAdditionalPath), value);
                    return;
                }

                if (explicitCustomPath && mode !== 'payment') {
                    setPathValue(result.customAttributes, parseFieldPath(explicitCustomPath), value);
                    return;
                }

                if (explicitExtensionPath) {
                    setPathValue(result.extensionAttributes, parseFieldPath(explicitExtensionPath), value);
                    return;
                }

                first = path[0] || '';
                second = path[1] || '';

                if (mode !== 'shipping' && (first === 'additional_data' || first === 'additionalData')) {
                    setPathValue(result.additionalData, path.slice(1), value);
                    return;
                }

                if (mode !== 'payment' && (first === 'custom_attributes' || first === 'customAttributes')) {
                    setPathValue(result.customAttributes, path.slice(1), value);
                    return;
                }

                if (first === 'extension_attributes' || first === 'extensionAttributes') {
                    setPathValue(result.extensionAttributes, path.slice(1), value);
                    return;
                }

                if (mode !== 'shipping' && first === 'payment') {
                    if (second === 'additional_data' || second === 'additionalData') {
                        setPathValue(result.additionalData, path.slice(2), value);
                    } else if (second === 'extension_attributes' || second === 'extensionAttributes') {
                        setPathValue(result.extensionAttributes, path.slice(2), value);
                    } else if (second === 'po_number' || second === 'poNumber') {
                        result.topLevel.po_number = value;
                        result.additionalData.po_number = value;
                    }
                    return;
                }

                if (mode !== 'payment' && first === 'shipping') {
                    if (second === 'custom_attributes' || second === 'customAttributes') {
                        setPathValue(result.customAttributes, path.slice(2), value);
                    } else if (second === 'extension_attributes' || second === 'extensionAttributes') {
                        setPathValue(result.extensionAttributes, path.slice(2), value);
                    }
                    return;
                }

                if (mode !== 'shipping' && (first === 'po_number' || first === 'poNumber')) {
                    result.topLevel.po_number = value;
                    result.additionalData.po_number = value;
                    return;
                }

                if (mode === 'payment' && path.length === 1 && isKnownPaymentAdditionalField(first)) {
                    result.additionalData[first] = value;
                    return;
                }

                if (mode === 'shipping' && (first === 'pickup_location_code' || first === 'pickupLocationCode')) {
                    result.extensionAttributes.pickup_location_code = value;
                }
            });
        });

        return result;
    }

    function getShippingFormRoots() {
        var roots = [],
            selectors = [
                '#onepage-checkout-shipping-method-additional-load',
                '#fastcheckout-ko-shipping-root',
                '.fastcheckout-ko-shipping-root',
                '.fastcheckout-ko-shipping-container',
                '[data-fastcheckout-shipping-fields]'
            ];

        function addRoot(root) {
            if (root && roots.indexOf(root) === -1) {
                roots.push(root);
            }
        }

        selectors.forEach(function (selector) {
            Array.prototype.slice.call(document.querySelectorAll(selector)).forEach(addRoot);
        });

        return roots;
    }

    return {
        getAddressValue: getAddressValue,
        getAddressAttributes: getAddressAttributes,
        normalizeAddressCustomAttributes: normalizeAddressCustomAttributes,
        normalizeAddressAttributeMap: normalizeAddressAttributeMap,
        collectStructuredFields: collectStructuredFields,
        getShippingFormRoots: getShippingFormRoots
    };
});
