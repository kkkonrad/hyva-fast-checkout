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
            normalizeAddressAttributeMap = typeof deps.normalizeAddressAttributeMap === 'function' ? deps.normalizeAddressAttributeMap : function (attributes) { return attributes || {}; },
            getAddressAttributes = typeof deps.getAddressAttributes === 'function' ? deps.getAddressAttributes : function () { return {}; },
            updateQuoteAddressAttributes = typeof deps.updateQuoteAddressAttributes === 'function' ? deps.updateQuoteAddressAttributes : function () {},
            getMagewireComponent = typeof deps.getMagewireComponent === 'function' ? deps.getMagewireComponent : function () { return null; },
            getProperty = typeof deps.getProperty === 'function' ? deps.getProperty : function () { return ''; },
            setMagewireValue = typeof deps.setMagewireValue === 'function' ? deps.setMagewireValue : function () { return null; };

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

        function sync(wire, deferUpdates) {
            var collected = collectStructuredFields(getShippingFormRoots(), { mode: 'shipping' }),
                customAttributes = collected.customAttributes || {},
                extensionAttributes = collected.extensionAttributes || {},
                shippingAddress = quote && typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null,
                operations = [];

            applyInPostLockerSelection(customAttributes, extensionAttributes);
            applyStorePickupSelection(customAttributes, extensionAttributes);

            if (!Object.keys(customAttributes).length && !Object.keys(extensionAttributes).length) {
                return Promise.resolve(false);
            }

            if (shippingAddress) {
                customAttributes = $.extend(
                    true,
                    {},
                    normalizeAddressAttributeMap(getAddressAttributes(shippingAddress, 'customAttributes', 'custom_attributes')),
                    customAttributes
                );
                extensionAttributes = $.extend(
                    true,
                    {},
                    getAddressAttributes(shippingAddress, 'extensionAttributes', 'extension_attributes'),
                    extensionAttributes
                );
                updateQuoteAddressAttributes(shippingAddress, customAttributes, extensionAttributes);
            }

            wire = wire || getMagewireComponent();
            if (!wire || typeof wire.set !== 'function') {
                return Promise.resolve(false);
            }

            customAttributes = $.extend(
                true,
                {},
                getProperty(wire, 'shippingCustomAttributes') || {},
                customAttributes
            );
            extensionAttributes = $.extend(
                true,
                {},
                getProperty(wire, 'shippingExtensionAttributes') || {},
                extensionAttributes
            );

            [
                ['shippingCustomAttributes', customAttributes],
                ['shippingExtensionAttributes', extensionAttributes]
            ].forEach(function (attributeData) {
                var operation;

                if (!Object.keys(attributeData[1] || {}).length) {
                    return;
                }

                operation = setMagewireValue(wire, attributeData[0], attributeData[1], deferUpdates === true);
                if (operation && typeof operation.then === 'function') {
                    operations.push(operation);
                }
            });

            return operations.length ? Promise.all(operations).then(function () { return true; }) : Promise.resolve(false);
        }

        return {
            sync: sync
        };
    };
});
