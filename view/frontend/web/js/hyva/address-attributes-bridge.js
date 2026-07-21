define([
    'jquery'
], function ($) {
    'use strict';

    return function (options) {
        var quote = options.quote,
            getCheckoutProvider = options.getCheckoutProvider,
            syncTimer = null,
            wireRetryCount = 0,
            magewireSyncValues = {};

        function getRootPath(path) {
            if (typeof path !== 'string' || !path.length) {
                return '';
            }

            return path.split('.')[0];
        }

        function isBillingAddressScope(scope) {
            return typeof scope === 'string' && /^billingAddress[^.]*$/.test(scope);
        }

        function isAddressAttributePath(path) {
            return typeof path === 'string' && (
                path.indexOf('.custom_attributes') !== -1 ||
                path.indexOf('.customAttributes') !== -1 ||
                path.indexOf('.extension_attributes') !== -1 ||
                path.indexOf('.extensionAttributes') !== -1
            );
        }

        function shouldSyncPath(path) {
            var root = getRootPath(path);

            if (root === 'shippingAddress') {
                return path === root || isAddressAttributePath(path);
            }

            if (isBillingAddressScope(root)) {
                return path === root || isAddressAttributePath(path);
            }

            return false;
        }

        function readProviderValue(provider, path) {
            if (!provider || !path) {
                return undefined;
            }

            if (typeof provider.get === 'function') {
                try {
                    return provider.get(path);
                } catch (e) {}
            }

            return undefined;
        }

        function getProviderAttributeData(provider, addressScope, camelKey, snakeKey) {
            var value = readProviderValue(provider, addressScope + '.' + snakeKey);

            if (typeof value === 'undefined') {
                value = readProviderValue(provider, addressScope + '.' + camelKey);
            }

            if (typeof value === 'undefined') {
                value = readProviderValue(provider, addressScope);
                if (value && typeof value === 'object') {
                    value = value[snakeKey] || value[camelKey];
                }
            }

            return value && typeof value === 'object' ? value : {};
        }

        function getBillingAddressScopes(provider) {
            var scopes = {
                billingAddress: true,
                billingAddressshared: true
            };

            function addScope(scope) {
                if (isBillingAddressScope(scope)) {
                    scopes[scope] = true;
                }
            }

            if (provider && provider.data && typeof provider.data === 'object') {
                Object.keys(provider.data).forEach(addScope);
            }

            if (window.checkoutConfig && Array.isArray(window.checkoutConfig.paymentMethods)) {
                window.checkoutConfig.paymentMethods.forEach(function (method) {
                    if (method && method.method) {
                        addScope('billingAddress' + method.method);
                    }
                });
            }

            if (quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()) {
                addScope('billingAddress' + quote.paymentMethod().method);
            }

            if (typeof document !== 'undefined') {
                Array.prototype.slice.call(document.querySelectorAll('input[name="payment_method"]')).forEach(function (input) {
                    if (input && input.value) {
                        addScope('billingAddress' + input.value);
                    }
                });
            }

            return Object.keys(scopes);
        }

        function normalizeCustomAttributes(attributes) {
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
                Object.keys(attributes).forEach(function (key) {
                    if (/^\d+$/.test(key)) {
                        return;
                    }
                    result.push({
                        attribute_code: key,
                        value: attributes[key]
                    });
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
                        return;
                    }

                    result.push({
                        attribute_code: key,
                        value: value
                    });
                });
            }

            return result;
        }

        function normalizeAttributeContainerAfterSet(provider, path, value) {
            var lastDot,
                containerPath,
                attributeCode,
                container,
                normalized;

            if (
                typeof path !== 'string' ||
                (
                    path.indexOf('.custom_attributes.') === -1 &&
                    path.indexOf('.customAttributes.') === -1 &&
                    path.indexOf('.extension_attributes.') === -1 &&
                    path.indexOf('.extensionAttributes.') === -1
                )
            ) {
                return;
            }

            lastDot = path.lastIndexOf('.');
            if (lastDot === -1) {
                return;
            }

            containerPath = path.substring(0, lastDot);
            attributeCode = path.substring(lastDot + 1);
            container = readProviderValue(provider, containerPath);

            if (!Array.isArray(container)) {
                return;
            }

            normalized = {};
            container.forEach(function (attribute) {
                if (attribute && typeof attribute === 'object' && attribute.attribute_code) {
                    normalized[attribute.attribute_code] = attribute.value;
                }
            });
            Object.keys(container).forEach(function (key) {
                if (!/^\d+$/.test(key)) {
                    normalized[key] = container[key];
                }
            });
            normalized[attributeCode] = value;

            provider.set(containerPath, normalized);
        }

        function normalizeAttributeMap(attributes) {
            var result = {};

            normalizeCustomAttributes(attributes).forEach(function (attribute) {
                if (attribute && attribute.attribute_code) {
                    result[attribute.attribute_code] = attribute.value;
                }
            });

            return result;
        }

        function getQuoteAddressForProviderPath(path) {
            var root = getRootPath(path);

            if (!quote) {
                return null;
            }

            if (root === 'shippingAddress' && typeof quote.shippingAddress === 'function') {
                return quote.shippingAddress();
            }

            if (
                isBillingAddressScope(root) &&
                typeof quote.billingAddress === 'function'
            ) {
                return quote.billingAddress();
            }

            return null;
        }

        function getQuoteAddressAttributeData(path, camelKey, snakeKey) {
            var address = getQuoteAddressForProviderPath(path),
                value;

            if (!address) {
                return {};
            }

            value = address[snakeKey] || address[camelKey];

            if (!value || typeof value !== 'object') {
                return {};
            }

            return camelKey === 'customAttributes'
                ? normalizeAttributeMap(value)
                : value;
        }

        function mergeAttributeData(primary, secondary) {
            return $.extend(true, {}, primary || {}, secondary || {});
        }

        function writeProviderValueIfDifferent(provider, path, value) {
            var current;

            if (!provider || typeof provider.set !== 'function' || typeof value === 'undefined') {
                return;
            }

            current = readProviderValue(provider, path);
            if (JSON.stringify(current || {}) === JSON.stringify(value || {})) {
                return;
            }

            provider.set(path, value);
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

        function getMagewireComponent() {
            var magewireEl = document.querySelector('[wire\\:id]'),
                livewire = window.Livewire || window.Magewire;

            if (magewireEl && magewireEl.__livewire) {
                return magewireEl.__livewire;
            }

            if (
                magewireEl &&
                livewire &&
                typeof livewire.find === 'function' &&
                magewireEl.getAttribute('wire:id')
            ) {
                return livewire.find(magewireEl.getAttribute('wire:id'));
            }

            return null;
        }

        function hasAttributeData(value) {
            return value && typeof value === 'object' && Object.keys(value).length > 0;
        }

        function isGuestAddressSnapshotRestorePending() {
            return window.fastcheckoutGuestAddressSnapshotRestorePending === true;
        }

        function isEmptyAttributeData(value) {
            return !value || (typeof value === 'object' && Object.keys(value).length === 0);
        }

        function setMagewireValue(wire, field, value) {
            var currentValue,
                cachedValue;

            if (!wire || typeof wire.set !== 'function' || typeof value === 'undefined' || value === null) {
                return;
            }

            cachedValue = magewireSyncValues[field];
            if (typeof cachedValue !== 'undefined' && JSON.stringify(cachedValue || {}) === JSON.stringify(value || {})) {
                return;
            }

            currentValue = getWireProperty(wire, field);
            if (isEmptyAttributeData(currentValue) && isEmptyAttributeData(value)) {
                magewireSyncValues[field] = {};
                return;
            }

            if (
                (typeof currentValue === 'object' || typeof value === 'object') &&
                JSON.stringify(currentValue || {}) === JSON.stringify(value || {})
            ) {
                magewireSyncValues[field] = $.extend(true, {}, value);
                return;
            }
            if (
                typeof currentValue !== 'object' &&
                typeof value !== 'object' &&
                String(currentValue || '') === String(value || '')
            ) {
                magewireSyncValues[field] = value;
                return;
            }

            magewireSyncValues[field] = typeof value === 'object'
                ? $.extend(true, {}, value)
                : value;
            wire.set(field, value, false);
        }

        function updateQuoteAddressAttributes(address, customAttributes, extensionAttributes) {
            if (!address) {
                return;
            }

            address.custom_attributes = customAttributes;
            address.customAttributes = normalizeCustomAttributes(customAttributes);
            address.extension_attributes = extensionAttributes;
            address.extensionAttributes = extensionAttributes;
        }

        function sync() {
            var provider = getCheckoutProvider(),
                wire = getMagewireComponent(),
                billingAddressScopes,
                shippingCustomAttributes,
                shippingExtensionAttributes,
                billingCustomAttributes,
                billingExtensionAttributes,
                shippingAddress,
                billingAddress;

            syncTimer = null;
            if (!provider) {
                return;
            }

            if (isGuestAddressSnapshotRestorePending()) {
                syncTimer = window.setTimeout(sync, 250);
                return;
            }

            shippingCustomAttributes = normalizeAttributeMap(getProviderAttributeData(
                provider,
                'shippingAddress',
                'customAttributes',
                'custom_attributes'
            ));
            shippingCustomAttributes = mergeAttributeData(
                getQuoteAddressAttributeData(
                    'shippingAddress',
                    'customAttributes',
                    'custom_attributes'
                ),
                shippingCustomAttributes
            );
            shippingExtensionAttributes = getProviderAttributeData(
                provider,
                'shippingAddress',
                'extensionAttributes',
                'extension_attributes'
            );
            shippingExtensionAttributes = mergeAttributeData(
                getQuoteAddressAttributeData(
                    'shippingAddress',
                    'extensionAttributes',
                    'extension_attributes'
                ),
                shippingExtensionAttributes
            );
            billingCustomAttributes = normalizeAttributeMap(getProviderAttributeData(
                provider,
                'billingAddress',
                'customAttributes',
                'custom_attributes'
            ));
            billingCustomAttributes = mergeAttributeData(
                getQuoteAddressAttributeData(
                    'billingAddress',
                    'customAttributes',
                    'custom_attributes'
                ),
                billingCustomAttributes
            );
            billingExtensionAttributes = getProviderAttributeData(
                provider,
                'billingAddress',
                'extensionAttributes',
                'extension_attributes'
            );
            billingExtensionAttributes = mergeAttributeData(
                getQuoteAddressAttributeData(
                    'billingAddress',
                    'extensionAttributes',
                    'extension_attributes'
                ),
                billingExtensionAttributes
            );
            billingAddressScopes = getBillingAddressScopes(provider);
            billingAddressScopes.forEach(function (scope) {
                if (scope === 'billingAddress') {
                    return;
                }

                billingCustomAttributes = mergeAttributeData(
                    billingCustomAttributes,
                    normalizeAttributeMap(getProviderAttributeData(
                        provider,
                        scope,
                        'customAttributes',
                        'custom_attributes'
                    ))
                );
                billingExtensionAttributes = mergeAttributeData(
                    billingExtensionAttributes,
                    getProviderAttributeData(
                        provider,
                        scope,
                        'extensionAttributes',
                        'extension_attributes'
                    )
                );
            });

            shippingAddress = quote && typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null;
            billingAddress = quote && typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;

            updateQuoteAddressAttributes(shippingAddress, shippingCustomAttributes, shippingExtensionAttributes);
            updateQuoteAddressAttributes(billingAddress, billingCustomAttributes, billingExtensionAttributes);

            writeProviderValueIfDifferent(
                provider,
                'shippingAddress.custom_attributes',
                shippingCustomAttributes
            );
            writeProviderValueIfDifferent(
                provider,
                'shippingAddress.extension_attributes',
                shippingExtensionAttributes
            );
            writeProviderValueIfDifferent(
                provider,
                'billingAddress.custom_attributes',
                billingCustomAttributes
            );
            writeProviderValueIfDifferent(
                provider,
                'billingAddress.extension_attributes',
                billingExtensionAttributes
            );
            billingAddressScopes.forEach(function (scope) {
                if (scope === 'billingAddress') {
                    return;
                }

                writeProviderValueIfDifferent(
                    provider,
                    scope + '.custom_attributes',
                    billingCustomAttributes
                );
                writeProviderValueIfDifferent(
                    provider,
                    scope + '.extension_attributes',
                    billingExtensionAttributes
                );
            });

            if (!wire) {
                if (
                    wireRetryCount < 6 &&
                    (
                        hasAttributeData(shippingCustomAttributes) ||
                        hasAttributeData(shippingExtensionAttributes) ||
                        hasAttributeData(billingCustomAttributes) ||
                        hasAttributeData(billingExtensionAttributes)
                    )
                ) {
                    wireRetryCount += 1;
                    window.setTimeout(sync, 150 * wireRetryCount);
                }

                return;
            }

            wireRetryCount = 0;
            setMagewireValue(wire, 'shippingCustomAttributes', shippingCustomAttributes);
            setMagewireValue(wire, 'shippingExtensionAttributes', shippingExtensionAttributes);
            setMagewireValue(wire, 'billingCustomAttributes', billingCustomAttributes);
            setMagewireValue(wire, 'billingExtensionAttributes', billingExtensionAttributes);
        }

        function schedule(path) {
            if (!shouldSyncPath(path)) {
                return;
            }

            // Single debounce — equality cache in setMagewireValue already skips no-ops.
            // Avoid multi-timeout fan-out (was 50 + 200 + 600 → up to 3 XHRs per attr write).
            if (syncTimer) {
                window.clearTimeout(syncTimer);
            }
            syncTimer = window.setTimeout(sync, 200);
        }

        function register() {
            var provider = getCheckoutProvider(),
                originalSet;

            if (!provider || provider.fastcheckoutAddressAttributeSyncRegistered || typeof provider.set !== 'function') {
                return;
            }

            provider.fastcheckoutAddressAttributeSyncRegistered = true;
            originalSet = provider.set;
            provider.set = function (path, value) {
                var root = getRootPath(path),
                    isAddressRootPath = path === root && (
                        root === 'shippingAddress' ||
                        isBillingAddressScope(root)
                    ),
                    existingCustomAttributes,
                    existingExtensionAttributes;

                if (
                    isAddressRootPath &&
                    value &&
                    typeof value === 'object'
                ) {
                    existingCustomAttributes = getProviderAttributeData(
                        provider,
                        path,
                        'customAttributes',
                        'custom_attributes'
                    );
                    if (!Object.keys(existingCustomAttributes).length) {
                        existingCustomAttributes = getQuoteAddressAttributeData(
                            path,
                            'customAttributes',
                            'custom_attributes'
                        );
                    }
                    existingExtensionAttributes = getProviderAttributeData(
                        provider,
                        path,
                        'extensionAttributes',
                        'extension_attributes'
                    );
                    if (!Object.keys(existingExtensionAttributes).length) {
                        existingExtensionAttributes = getQuoteAddressAttributeData(
                            path,
                            'extensionAttributes',
                            'extension_attributes'
                        );
                    }

                    if (
                        Object.keys(existingCustomAttributes).length &&
                        !value.custom_attributes &&
                        !value.customAttributes
                    ) {
                        value.custom_attributes = existingCustomAttributes;
                        value.customAttributes = existingCustomAttributes;
                    }
                    if (
                        Object.keys(existingExtensionAttributes).length &&
                        !value.extension_attributes &&
                        !value.extensionAttributes
                    ) {
                        value.extension_attributes = existingExtensionAttributes;
                        value.extensionAttributes = existingExtensionAttributes;
                    }
                }

                var result = originalSet.apply(provider, arguments);

                normalizeAttributeContainerAfterSet(provider, path, value);

                schedule(path);

                return result;
            };
        }

        return {
            register: register,
            sync: sync,
            updateQuoteAddressAttributes: updateQuoteAddressAttributes
        };
    };
});
