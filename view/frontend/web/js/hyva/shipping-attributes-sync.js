define([
    'jquery'
], function ($) {
    'use strict';

    return function (deps) {
        deps = deps || {};

        var checkoutData = deps.checkoutData,
            quote = deps.quote,
            getShippingMethodCode = typeof deps.getShippingMethodCode === 'function' ? deps.getShippingMethodCode : function () { return ''; },
            collectStructuredFields = typeof deps.collectStructuredFields === 'function' ? deps.collectStructuredFields : function () { return {}; },
            getShippingFormRoots = typeof deps.getShippingFormRoots === 'function' ? deps.getShippingFormRoots : function () { return []; },
            getCheckoutProvider = typeof deps.getCheckoutProvider === 'function' ? deps.getCheckoutProvider : function () { return null; },
            normalizeAddressAttributeMap = typeof deps.normalizeAddressAttributeMap === 'function' ? deps.normalizeAddressAttributeMap : function (attributes) { return attributes || {}; },
            getAddressAttributes = typeof deps.getAddressAttributes === 'function' ? deps.getAddressAttributes : function () { return {}; },
            updateQuoteAddressAttributes = typeof deps.updateQuoteAddressAttributes === 'function' ? deps.updateQuoteAddressAttributes : function () {};

        function getProviderAttributes(provider, camelKey, snakeKey) {
            var value;

            if (!provider) {
                return {};
            }

            if (typeof provider.get === 'function') {
                value = provider.get('shippingAddress.' + snakeKey);
                if (typeof value === 'undefined') {
                    value = provider.get('shippingAddress.' + camelKey);
                }
                if (typeof value === 'undefined') {
                    value = provider.get('shippingAddress');
                    value = value && typeof value === 'object' ? value[snakeKey] || value[camelKey] : value;
                }
            }

            return value && typeof value === 'object' ? value : {};
        }

        function serializeAttributeData(value) {
            var serialized = JSON.stringify(value || {});

            return serialized === '[]' ? '{}' : serialized;
        }

        function getCurrentShippingMethodCode() {
            var checkedDomRadio = document.querySelector('input[name="shipping_method"]:checked'),
                activeMethod = quote && typeof quote.shippingMethod === 'function' ? quote.shippingMethod() : null;

            if (checkedDomRadio && checkedDomRadio.value) {
                return checkedDomRadio.value;
            }
            if (activeMethod) {
                return getShippingMethodCode(activeMethod);
            }

            return '';
        }

        function isInPostPickupShippingMethodCode(methodCode) {
            methodCode = String(methodCode || '').toLowerCase();
            if (!methodCode) {
                return false;
            }

            return methodCode.indexOf('inpostlocker') !== -1 ||
                methodCode.indexOf('paczkomat') !== -1 ||
                (
                    methodCode.indexOf('inpost') !== -1 &&
                    (
                        methodCode.indexOf('locker') !== -1 ||
                        methodCode.indexOf('box') !== -1 ||
                        methodCode.indexOf('point') !== -1
                    )
                );
        }

        function isMagentoStorePickupShippingMethodCode(methodCode) {
            methodCode = String(methodCode || '').toLowerCase();

            return methodCode === 'instore_pickup' ||
                methodCode === 'pickup_instore' ||
                methodCode === 'instore' ||
                methodCode.indexOf('storepickup') !== -1 ||
                methodCode.indexOf('store_pickup') !== -1 ||
                methodCode.indexOf('in_store_pickup') !== -1;
        }

        function getInPostLockerIdFromCheckoutData() {
            var pointData;

            if (!checkoutData || typeof checkoutData.getShippingInPostPoint !== 'function') {
                return '';
            }

            pointData = checkoutData.getShippingInPostPoint();
            if (!pointData) {
                return '';
            }
            if (typeof pointData === 'string') {
                return pointData;
            }

            return String(
                pointData.name ||
                pointData.id ||
                pointData.code ||
                pointData.value ||
                pointData.inpost_locker_id ||
                pointData.inpostLockerId ||
                ''
            );
        }

        function getPickupLocationCodeFromAddressData(addressData) {
            var extensionAttributes;

            if (!addressData) {
                return '';
            }
            if (typeof addressData === 'string') {
                return addressData;
            }

            extensionAttributes = addressData.extension_attributes ||
                addressData.extensionAttributes ||
                {};

            return String(
                extensionAttributes.pickup_location_code ||
                extensionAttributes.pickupLocationCode ||
                addressData.pickup_location_code ||
                addressData.pickupLocationCode ||
                addressData.code ||
                addressData.id ||
                ''
            );
        }

        function getStorePickupLocationCodeFromCheckoutData() {
            if (!checkoutData || typeof checkoutData.getSelectedPickupAddress !== 'function') {
                return '';
            }

            return getPickupLocationCodeFromAddressData(checkoutData.getSelectedPickupAddress());
        }

        function applyInPostLockerSelection(customAttributes, extensionAttributes) {
            var lockerId;

            if (!isInPostPickupShippingMethodCode(getCurrentShippingMethodCode())) {
                return;
            }

            lockerId = getInPostLockerIdFromCheckoutData();
            if (!lockerId) {
                return;
            }

            extensionAttributes.inpost_locker_id = lockerId;
            extensionAttributes.inpostLockerId = lockerId;
            customAttributes.inpost_locker_id = lockerId;
        }

        function applyStorePickupSelection(customAttributes, extensionAttributes) {
            var pickupLocationCode;

            if (!isMagentoStorePickupShippingMethodCode(getCurrentShippingMethodCode())) {
                return;
            }

            pickupLocationCode = getStorePickupLocationCodeFromCheckoutData();
            if (!pickupLocationCode) {
                return;
            }

            extensionAttributes.pickup_location_code = pickupLocationCode;
            customAttributes.pickup_location_code = pickupLocationCode;
        }

        function sync() {
            var collected = collectStructuredFields(getShippingFormRoots(), { mode: 'shipping' }),
                customAttributes = collected.customAttributes || {},
                extensionAttributes = collected.extensionAttributes || {},
                shippingAddress = quote && typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null,
                provider = getCheckoutProvider(),
                providerCustomAttributes = normalizeAddressAttributeMap(
                    getProviderAttributes(provider, 'customAttributes', 'custom_attributes')
                ),
                providerExtensionAttributes = getProviderAttributes(
                    provider,
                    'extensionAttributes',
                    'extension_attributes'
                );

            applyInPostLockerSelection(customAttributes, extensionAttributes);
            applyStorePickupSelection(customAttributes, extensionAttributes);

            if (shippingAddress) {
                customAttributes = $.extend(
                    true,
                    {},
                    normalizeAddressAttributeMap(getAddressAttributes(shippingAddress, 'customAttributes', 'custom_attributes')),
                    providerCustomAttributes,
                    customAttributes
                );
                extensionAttributes = $.extend(
                    true,
                    {},
                    getAddressAttributes(shippingAddress, 'extensionAttributes', 'extension_attributes'),
                    providerExtensionAttributes,
                    extensionAttributes
                );
                updateQuoteAddressAttributes(shippingAddress, customAttributes, extensionAttributes);
            } else {
                customAttributes = $.extend(true, {}, providerCustomAttributes, customAttributes);
                extensionAttributes = $.extend(true, {}, providerExtensionAttributes, extensionAttributes);
            }

            // Provider-only attributes are common for UI components without a native
            // DOM input (for example modal selectors). Do not return before those
            // values have been merged into the payload.
            if (
                serializeAttributeData(customAttributes) === '{}' &&
                serializeAttributeData(extensionAttributes) === '{}'
            ) {
                return Promise.resolve(false);
            }

            return Promise.resolve(true);
        }

        return {
            sync: sync
        };
    };
});
