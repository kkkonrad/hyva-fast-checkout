define([
    'jquery'
], function ($) {
    'use strict';

    return function (config) {
        if (window.fastcheckoutKoPaymentBridgeInitialized) {
            return;
        }

        window.fastcheckoutKoPaymentBridgeInitialized = true;
        window.fastcheckoutKoPaymentBridgeInitCount = (window.fastcheckoutKoPaymentBridgeInitCount || 0) + 1;
        
        var scope = config.scope || 'fastcheckoutHyvaPaymentRenderers',
            rendererComponents = config.rendererComponents || [],
            rendererComponentMap = config.rendererComponentMap || [],
            rendererComponentsByMethod = {},
            rendererComponentEntries = [],
            loadedRendererComponents = {},
            loadingRendererComponents = {},
            patchRenderersHandler = null,
            syncPaymentRenderersHandler = null;

        rendererComponentMap.forEach(function (entry) {
            if (entry && entry.method && entry.component) {
                rendererComponentEntries.push(entry);
                rendererComponentsByMethod[entry.method] = entry.component;
            }
        });

        window.fastcheckoutKoPaymentRendererComponentMap = rendererComponentMap.slice(0);

        window.fastcheckoutKoLoadedPaymentRendererComponents = window.fastcheckoutKoLoadedPaymentRendererComponents || [];

        window.checkoutConfig = config.checkoutConfig || {};

        var initPaymentProxy = function(paymentObj) {
            paymentObj = paymentObj || {};
            if (paymentObj.__isProxy) {
                return paymentObj;
            }
            return new Proxy(paymentObj, {
                get: function(target, prop) {
                    if (prop === '__isProxy') {
                        return true;
                    }
                    if (prop === '__raw__') {
                        return target;
                    }
                    if (typeof prop === 'string' && !(prop in target)) {
                        target[prop] = {};
                    }
                    return target[prop];
                }
            });
        };
        window.checkoutConfig.payment = initPaymentProxy(window.checkoutConfig.payment);
        if (!window.checkoutConfig.totalsData || typeof window.checkoutConfig.totalsData !== 'object') {
            window.checkoutConfig.totalsData = {
                items: window.checkoutConfig.quoteItemData || [],
                total_segments: [],
                subtotal: 0,
                subtotal_with_discount: 0,
                grand_total: 0
            };
        }
        window.isCustomerLoggedIn = window.checkoutConfig.isCustomerLoggedIn;
        window.customerData = window.checkoutConfig.customerData;

        require([
            'knockout',
            'Magento_Ui/js/core/app',
            'Magento_Checkout/js/model/payment-service',
            'Magento_Checkout/js/model/payment/method-converter',
            'Magento_Checkout/js/model/payment/method-list',
            'Magento_Checkout/js/model/quote',
            'Magento_Checkout/js/model/totals',
            'Magento_Checkout/js/action/select-payment-method',
            'uiRegistry',
            'Magento_Checkout/js/model/shipping-service',
            'Magento_Checkout/js/model/shipping-rate-service',
            'Magento_Checkout/js/model/shipping-rates-validator',
            'Magento_Checkout/js/checkout-data',
            'Magento_Checkout/js/action/select-shipping-address',
            'Magento_Checkout/js/action/select-shipping-method',
            'Magento_Checkout/js/action/select-billing-address',
            'Magento_Checkout/js/model/address-converter',
            'Magento_Checkout/js/action/set-shipping-information',
            'Magento_Checkout/js/model/payment/additional-validators',
            'Magento_Ui/js/model/messages',
            'Magento_Ui/js/model/messageList',
            'Magento_Checkout/js/model/error-processor',
            'Magento_Checkout/js/model/full-screen-loader',
            'Magento_Checkout/js/model/payment/place-order-hooks',
            'mage/translate'
        ], function (
            ko,
            app,
            paymentService,
            methodConverter,
            methodList,
            quote,
            checkoutTotals,
            selectPaymentMethodAction,
            registry,
            shippingService,
            shippingRateService,
            shippingRatesValidator,
            checkoutData,
            selectShippingAddressAction,
            selectShippingMethodAction,
            selectBillingAddressAction,
            addressConverter,
            setShippingInformationAction,
            additionalValidators,
            Messages,
            globalMessageList,
            errorProcessor,
            fullScreenLoader,
            placeOrderHooks,
            $t
        ) {
            if (quote && quote.billingAddress) {
                var currentBilling = quote.billingAddress();
                if (currentBilling && typeof currentBilling.getCacheKey !== 'function') {
                    currentBilling.getCacheKey = function () {
                        return 'billing-address-placeholder';
                    };
                }
                var originalBillingAddress = quote.billingAddress;
                quote.billingAddress = function (value) {
                    if (arguments.length > 0) {
                        if (value && typeof value.getCacheKey !== 'function') {
                            value.getCacheKey = function () {
                                return 'billing-address-placeholder';
                            };
                        }
                    }
                    return originalBillingAddress.apply(this, arguments);
                };
                Object.keys(originalBillingAddress).forEach(function (key) {
                    quote.billingAddress[key] = originalBillingAddress[key];
                });
                quote.billingAddress.subscribe = originalBillingAddress.subscribe.bind(originalBillingAddress);
            }

            if (quote && quote.shippingAddress) {
                var currentShipping = quote.shippingAddress();
                if (currentShipping && typeof currentShipping.getCacheKey !== 'function') {
                    currentShipping.getCacheKey = function () {
                        return 'shipping-address-placeholder';
                    };
                }
                var originalShippingAddress = quote.shippingAddress;
                quote.shippingAddress = function (value) {
                    if (arguments.length > 0) {
                        if (value && typeof value.getCacheKey !== 'function') {
                            value.getCacheKey = function () {
                                return 'shipping-address-placeholder';
                            };
                        }
                    }
                    return originalShippingAddress.apply(this, arguments);
                };
                Object.keys(originalShippingAddress).forEach(function (key) {
                    quote.shippingAddress[key] = originalShippingAddress[key];
                });
                quote.shippingAddress.subscribe = originalShippingAddress.subscribe.bind(originalShippingAddress);
            }

            if (checkoutData) {
                var cacheKey = 'checkout-data';
                var getLocalData = function () {
                    try {
                        var raw = window.localStorage ? window.localStorage.getItem(cacheKey) : null;
                        return raw ? JSON.parse(raw) : {};
                    } catch (e) { return {}; }
                };
                var saveLocalData = function (data) {
                    try { if (window.localStorage) window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
                };

                if (typeof checkoutData.setShippingInPostPoint !== 'function') {
                    checkoutData.setShippingInPostPoint = function (data) {
                        var obj = getLocalData();
                        obj.shippingInPostPointData = data;
                        saveLocalData(obj);
                    };
                }
                if (typeof checkoutData.getShippingInPostPoint !== 'function') {
                    checkoutData.getShippingInPostPoint = function () {
                        return getLocalData().shippingInPostPointData || null;
                    };
                }
                if (typeof checkoutData.setShippingInPostMode !== 'function') {
                    checkoutData.setShippingInPostMode = function (data) {
                        var obj = getLocalData();
                        obj.shippingInPostModeData = data;
                        saveLocalData(obj);
                    };
                }
                if (typeof checkoutData.getShippingInPostMode !== 'function') {
                    checkoutData.getShippingInPostMode = function () {
                        return getLocalData().shippingInPostModeData || null;
                    };
                }
            }

            function createCheckoutProviderFallback() {
                var data = {
                        params: {
                            invalid: false
                        },
                        shippingAddress: {},
                        billingAddress: {},
                        billingAddressshared: {},
                        dictionaries: {
                            country_id: getCountryDictionaryOptions()
                        }
                    },
                    listeners = {};

                function splitPath(path) {
                    return typeof path === 'string' && path.length ? path.split('.') : [];
                }

                function ensurePath(path) {
                    var parts = splitPath(path),
                        current = data;

                    parts.forEach(function (part) {
                        if (typeof current[part] === 'undefined' || current[part] === null) {
                            current[part] = {};
                        }
                        current = current[part];
                    });

                    return current;
                }

                function getPath(path) {
                    var parts = splitPath(path),
                        current = data;

                    if (typeof path === 'string' && path.indexOf('billingAddress') === 0 && typeof data[path] === 'undefined') {
                        data[path] = {};
                    }

                    if (!parts.length) {
                        return data;
                    }

                    parts.some(function (part) {
                        if (typeof current === 'undefined' || current === null || typeof current[part] === 'undefined') {
                            current = undefined;
                            return true;
                        }
                        current = current[part];
                        return false;
                    });

                    return current;
                }

                function setPath(path, value) {
                    var parts = splitPath(path),
                        last = parts.pop(),
                        parent = data;

                    if (!last) {
                        return;
                    }

                    parts.forEach(function (part) {
                        if (typeof parent[part] === 'undefined' || parent[part] === null) {
                            parent[part] = {};
                        }
                        parent = parent[part];
                    });

                    parent[last] = value;
                    data[path] = value;
                }

                function notify(path, value, changes) {
                    if (!listeners[path]) {
                        return;
                    }

                    listeners[path].slice().forEach(function (callback) {
                        callback(value, changes || []);
                    });
                }

                return {
                    data: data,
                    params: data.params,
                    shippingAddress: data.shippingAddress,
                    billingAddress: data.billingAddress,
                    dictionaries: data.dictionaries,
                    get: function (path) {
                        return getPath(path);
                    },
                    set: function (path, value) {
                        var oldValue = getPath(path);

                        setPath(path, value);
                        if (path === 'shippingAddress') {
                            this.shippingAddress = value;
                        } else if (path === 'billingAddress') {
                            this.billingAddress = value;
                        } else if (path === 'dictionaries') {
                            this.dictionaries = value;
                        }
                        notify(path, value, [{
                            path: path,
                            value: value,
                            oldValue: oldValue
                        }]);

                        return this;
                    },
                    on: function (path, callback) {
                        listeners[path] = listeners[path] || [];
                        listeners[path].push(callback);

                        return this;
                    },
                    off: function (path) {
                        if (path) {
                            delete listeners[path];
                        }

                        return this;
                    },
                    trigger: function (path, changes) {
                        notify(path, getPath(path), changes || []);

                        return this;
                    },
                    setInitial: function (path, value) {
                        if (typeof getPath(path) === 'undefined') {
                            this.set(path, value);
                        }

                        return this;
                    },
                    ensurePath: ensurePath
                };
            }

            function getCountryDictionaryOptions() {
                var options = [];

                document.querySelectorAll('#co-shipping-country-id option, select[name="country_id"] option').forEach(function (option) {
                    var value = option.value;

                    if (!value && value !== '') {
                        return;
                    }

                    if (options.some(function (item) { return item.value === value; })) {
                        return;
                    }

                    options.push({
                        value: value,
                        label: option.textContent ? option.textContent.trim() : value
                    });
                });

                if (!options.length && window.checkoutConfig && window.checkoutConfig.defaultCountryId) {
                    options.push({
                        value: window.checkoutConfig.defaultCountryId,
                        label: window.checkoutConfig.defaultCountryId
                    });
                }

                return options;
            }

            function getCountryOptionsByValue() {
                var indexedOptions = {};

                getCountryDictionaryOptions().forEach(function (option) {
                    if (!option || !option.value) {
                        return;
                    }

                    indexedOptions[option.value] = $.extend({
                        is_region_required: false
                    }, option);
                });

                return indexedOptions;
            }

            var checkoutProviderAddressAttributeSyncTimer = null;

            function getCheckoutProvider() {
                var provider;

                try {
                    provider = registry.get('checkoutProvider');
                } catch (e) {
                    provider = null;
                }

                if (!provider) {
                    provider = createCheckoutProviderFallback();
                    try {
                        registry.set('checkoutProvider', provider);
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: could not register fallback checkoutProvider.', e);
                        }
                    }
                } else if (provider && !provider.dictionaries) {
                    provider.dictionaries = provider.get && provider.get('dictionaries') ? provider.get('dictionaries') : {
                        country_id: getCountryDictionaryOptions()
                    };
                }

                return provider;
            }

            function shouldSyncCheckoutProviderAddressPath(path) {
                return typeof path === 'string' && (
                    path === 'shippingAddress' ||
                    path === 'billingAddress' ||
                    path === 'billingAddressshared' ||
                    path.indexOf('shippingAddress.custom_attributes') === 0 ||
                    path.indexOf('shippingAddress.customAttributes') === 0 ||
                    path.indexOf('shippingAddress.extension_attributes') === 0 ||
                    path.indexOf('shippingAddress.extensionAttributes') === 0 ||
                    path.indexOf('billingAddress.custom_attributes') === 0 ||
                    path.indexOf('billingAddress.customAttributes') === 0 ||
                    path.indexOf('billingAddress.extension_attributes') === 0 ||
                    path.indexOf('billingAddress.extensionAttributes') === 0 ||
                    path.indexOf('billingAddressshared.custom_attributes') === 0 ||
                    path.indexOf('billingAddressshared.customAttributes') === 0 ||
                    path.indexOf('billingAddressshared.extension_attributes') === 0 ||
                    path.indexOf('billingAddressshared.extensionAttributes') === 0
                );
            }

            function readCheckoutProviderValue(provider, path) {
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

            function getCheckoutProviderAttributeData(provider, addressScope, camelKey, snakeKey) {
                var value = readCheckoutProviderValue(provider, addressScope + '.' + snakeKey);

                if (typeof value === 'undefined') {
                    value = readCheckoutProviderValue(provider, addressScope + '.' + camelKey);
                }

                if (typeof value === 'undefined') {
                    value = readCheckoutProviderValue(provider, addressScope);
                    if (value && typeof value === 'object') {
                        value = value[snakeKey] || value[camelKey];
                    }
                }

                return value && typeof value === 'object' ? value : {};
            }

            function updateQuoteAddressAttributes(address, customAttributes, extensionAttributes) {
                if (!address) {
                    return;
                }

                address.custom_attributes = customAttributes;
                address.customAttributes = normalizeCheckoutProviderAddressCustomAttributes(customAttributes);
                address.extension_attributes = extensionAttributes;
                address.extensionAttributes = extensionAttributes;
            }

            function normalizeCheckoutProviderAddressCustomAttributes(attributes) {
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

            function normalizeCheckoutProviderAttributeContainerAfterSet(provider, path, value) {
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
                container = readCheckoutProviderValue(provider, containerPath);

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

            function normalizeCheckoutProviderAddressAttributeMap(attributes) {
                var result = {};

                normalizeCheckoutProviderAddressCustomAttributes(attributes).forEach(function (attribute) {
                    if (attribute && attribute.attribute_code) {
                        result[attribute.attribute_code] = attribute.value;
                    }
                });

                return result;
            }

            function getQuoteAddressForCheckoutProviderPath(path) {
                if (!quote) {
                    return null;
                }

                if (path === 'shippingAddress' && typeof quote.shippingAddress === 'function') {
                    return quote.shippingAddress();
                }

                if (
                    (path === 'billingAddress' || path === 'billingAddressshared') &&
                    typeof quote.billingAddress === 'function'
                ) {
                    return quote.billingAddress();
                }

                return null;
            }

            function getQuoteAddressAttributeDataForProviderPath(path, camelKey, snakeKey) {
                var address = getQuoteAddressForCheckoutProviderPath(path),
                    value;

                if (!address) {
                    return {};
                }

                value = address[snakeKey] || address[camelKey];

                if (!value || typeof value !== 'object') {
                    return {};
                }

                return camelKey === 'customAttributes'
                    ? normalizeCheckoutProviderAddressAttributeMap(value)
                    : value;
            }

            function mergeCheckoutProviderAttributeData(primary, secondary) {
                return $.extend(true, {}, primary || {}, secondary || {});
            }

            function writeCheckoutProviderValueIfDifferent(provider, path, value) {
                var current;

                if (!provider || typeof provider.set !== 'function' || typeof value === 'undefined') {
                    return;
                }

                current = readCheckoutProviderValue(provider, path);
                if (JSON.stringify(current || {}) === JSON.stringify(value || {})) {
                    return;
                }

                provider.set(path, value);
            }

            function setMagewireValueFromCheckoutProviderSync(wire, field, value) {
                var currentValue;

                if (!wire || typeof wire.set !== 'function' || typeof value === 'undefined' || value === null) {
                    return;
                }

                currentValue = getPropertyFromCheckoutProviderWire(wire, field);
                if (
                    (typeof currentValue === 'object' || typeof value === 'object') &&
                    JSON.stringify(currentValue || {}) === JSON.stringify(value || {})
                ) {
                    return;
                }
                if (
                    typeof currentValue !== 'object' &&
                    typeof value !== 'object' &&
                    String(currentValue || '') === String(value || '')
                ) {
                    return;
                }

                wire.set(field, value, true);
            }

            function getPropertyFromCheckoutProviderWire(wire, name) {
                if (!wire) {
                    return '';
                }
                if (typeof wire[name] !== 'undefined') {
                    return wire[name];
                }
                if (typeof wire.get === 'function') {
                    return wire.get(name);
                }
                if (wire.data && typeof wire.data[name] !== 'undefined') {
                    return wire.data[name];
                }

                return '';
            }

            function getMagewireComponentForCheckoutProviderSync() {
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

            function syncCheckoutProviderAddressAttributes() {
                var provider = getCheckoutProvider(),
                    wire = getMagewireComponentForCheckoutProviderSync(),
                    shippingCustomAttributes,
                    shippingExtensionAttributes,
                    billingCustomAttributes,
                    billingExtensionAttributes,
                    shippingAddress,
                    billingAddress;

                checkoutProviderAddressAttributeSyncTimer = null;
                if (!provider) {
                    return;
                }

                shippingCustomAttributes = normalizeCheckoutProviderAddressAttributeMap(getCheckoutProviderAttributeData(
                    provider,
                    'shippingAddress',
                    'customAttributes',
                    'custom_attributes'
                ));
                shippingCustomAttributes = mergeCheckoutProviderAttributeData(
                    getQuoteAddressAttributeDataForProviderPath(
                        'shippingAddress',
                        'customAttributes',
                        'custom_attributes'
                    ),
                    shippingCustomAttributes
                );
                shippingExtensionAttributes = getCheckoutProviderAttributeData(
                    provider,
                    'shippingAddress',
                    'extensionAttributes',
                    'extension_attributes'
                );
                shippingExtensionAttributes = mergeCheckoutProviderAttributeData(
                    getQuoteAddressAttributeDataForProviderPath(
                        'shippingAddress',
                        'extensionAttributes',
                        'extension_attributes'
                    ),
                    shippingExtensionAttributes
                );
                billingCustomAttributes = normalizeCheckoutProviderAddressAttributeMap(getCheckoutProviderAttributeData(
                    provider,
                    'billingAddress',
                    'customAttributes',
                    'custom_attributes'
                ));
                billingCustomAttributes = mergeCheckoutProviderAttributeData(
                    getQuoteAddressAttributeDataForProviderPath(
                        'billingAddress',
                        'customAttributes',
                        'custom_attributes'
                    ),
                    billingCustomAttributes
                );
                billingExtensionAttributes = getCheckoutProviderAttributeData(
                    provider,
                    'billingAddress',
                    'extensionAttributes',
                    'extension_attributes'
                );
                billingExtensionAttributes = mergeCheckoutProviderAttributeData(
                    getQuoteAddressAttributeDataForProviderPath(
                        'billingAddress',
                        'extensionAttributes',
                        'extension_attributes'
                    ),
                    billingExtensionAttributes
                );

                shippingAddress = quote && typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null;
                billingAddress = quote && typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;

                updateQuoteAddressAttributes(shippingAddress, shippingCustomAttributes, shippingExtensionAttributes);
                updateQuoteAddressAttributes(billingAddress, billingCustomAttributes, billingExtensionAttributes);

                writeCheckoutProviderValueIfDifferent(
                    provider,
                    'shippingAddress.custom_attributes',
                    shippingCustomAttributes
                );
                writeCheckoutProviderValueIfDifferent(
                    provider,
                    'shippingAddress.extension_attributes',
                    shippingExtensionAttributes
                );
                writeCheckoutProviderValueIfDifferent(
                    provider,
                    'billingAddress.custom_attributes',
                    billingCustomAttributes
                );
                writeCheckoutProviderValueIfDifferent(
                    provider,
                    'billingAddress.extension_attributes',
                    billingExtensionAttributes
                );

                if (wire) {
                    setMagewireValueFromCheckoutProviderSync(wire, 'shippingCustomAttributes', shippingCustomAttributes);
                    setMagewireValueFromCheckoutProviderSync(wire, 'shippingExtensionAttributes', shippingExtensionAttributes);
                    setMagewireValueFromCheckoutProviderSync(wire, 'billingCustomAttributes', billingCustomAttributes);
                    setMagewireValueFromCheckoutProviderSync(wire, 'billingExtensionAttributes', billingExtensionAttributes);
                }
            }

            function scheduleCheckoutProviderAddressAttributeSync(path) {
                if (!shouldSyncCheckoutProviderAddressPath(path)) {
                    return;
                }

                if (checkoutProviderAddressAttributeSyncTimer) {
                    window.clearTimeout(checkoutProviderAddressAttributeSyncTimer);
                }
                checkoutProviderAddressAttributeSyncTimer = window.setTimeout(syncCheckoutProviderAddressAttributes, 50);

                if (
                    path.indexOf('.custom_attributes.') !== -1 ||
                    path.indexOf('.customAttributes.') !== -1 ||
                    path.indexOf('.extension_attributes.') !== -1 ||
                    path.indexOf('.extensionAttributes.') !== -1
                ) {
                    [200, 600].forEach(function (delay) {
                        window.setTimeout(syncCheckoutProviderAddressAttributes, delay);
                    });
                }
            }

            function registerCheckoutProviderAddressAttributeSync() {
                var provider = getCheckoutProvider(),
                    originalSet;

                if (!provider || provider.fastcheckoutAddressAttributeSyncRegistered || typeof provider.set !== 'function') {
                    return;
                }

                provider.fastcheckoutAddressAttributeSyncRegistered = true;
                originalSet = provider.set;
                provider.set = function (path, value) {
                    var existingCustomAttributes,
                        existingExtensionAttributes;

                    if (
                        (path === 'shippingAddress' || path === 'billingAddress' || path === 'billingAddressshared') &&
                        value &&
                        typeof value === 'object'
                    ) {
                        existingCustomAttributes = getCheckoutProviderAttributeData(
                            provider,
                            path,
                            'customAttributes',
                            'custom_attributes'
                        );
                        if (!Object.keys(existingCustomAttributes).length) {
                            existingCustomAttributes = getQuoteAddressAttributeDataForProviderPath(
                                path,
                                'customAttributes',
                                'custom_attributes'
                            );
                        }
                        existingExtensionAttributes = getCheckoutProviderAttributeData(
                            provider,
                            path,
                            'extensionAttributes',
                            'extension_attributes'
                        );
                        if (!Object.keys(existingExtensionAttributes).length) {
                            existingExtensionAttributes = getQuoteAddressAttributeDataForProviderPath(
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

                    normalizeCheckoutProviderAttributeContainerAfterSet(provider, path, value);

                    scheduleCheckoutProviderAddressAttributeSync(path);

                    return result;
                };
            }

            function createShippingAddressComponentFallback() {
                var component = {
                    name: 'fastcheckout.shippingAddress',
                    index: 'shippingAddress',
                    isFormInline: true,
                    source: getCheckoutProvider(),
                    errorValidationMessage: function (message) {
                        if (arguments.length) {
                            component.errorMessage = message || false;
                            if (message && typeof document !== 'undefined') {
                                document.dispatchEvent(new CustomEvent('fastcheckout:shipping-error', {
                                    detail: {
                                        message: message
                                    }
                                }));
                            }
                        }

                        return component.errorMessage || false;
                    },
                    validateShippingInformation: function () {
                        var provider = getCheckoutProvider(),
                            isValid = true;

                        if (provider && typeof provider.set === 'function') {
                            provider.set('params.invalid', false);
                        }

                        if (!quote.isVirtual || !quote.isVirtual()) {
                            if (!quote.shippingMethod || !quote.shippingMethod()) {
                                this.errorValidationMessage($t('The shipping method is missing. Select the shipping method and try again.'));
                                if (provider && typeof provider.set === 'function') {
                                    provider.set('params.invalid', true);
                                }
                                return false;
                            }
                        }

                        if (
                            window.fastcheckoutHyvaShipping &&
                            typeof window.fastcheckoutHyvaShipping.validate === 'function'
                        ) {
                            isValid = window.fastcheckoutHyvaShipping.validate();
                        }

                        if (!isValid && provider && typeof provider.set === 'function') {
                            provider.set('params.invalid', true);
                        }

                        return isValid && !(provider && provider.get && provider.get('params.invalid'));
                    },
                    triggerShippingDataValidateEvent: function () {
                        var provider = getCheckoutProvider();

                        if (provider && typeof provider.trigger === 'function') {
                            provider.trigger('shippingAddress.data.validate');
                        }
                    },
                    focusInvalid: function () {
                        var invalid = document.querySelector('#co-checkout-form [aria-invalid="true"], #co-checkout-form .mage-error, #co-checkout-form .field-error');

                        if (invalid) {
                            invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    },
                    setShippingInformation: function () {
                        return this.validateShippingInformation();
                    }
                };

                component.errorMessage = false;

                return component;
            }

            function getShippingAddressComponent() {
                var component;

                try {
                    component = registry.get('index = shippingAddress');
                } catch (e) {
                    component = null;
                }

                if (!component) {
                    component = createShippingAddressComponentFallback();
                    try {
                        registry.set('fastcheckout.shippingAddress', component);
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: could not register fallback shippingAddress component.', e);
                        }
                    }
                }

                return component;
            }

            function createBillingAddressComponentFallback() {
                var component = {
                    name: 'fastcheckout.billingAddress',
                    index: 'billingAddress',
                    isAddressSameAsShipping: ko.observable(true),
                    isAddressFormVisible: ko.observable(false),
                    isAddressDetailsVisible: ko.observable(true),
                    errorValidationMessage: ko.observable(false),
                    errorMessage: false,
                    
                    updateAddress: function () {
                        // Empty mock
                    },
                    useShippingAddress: function () {
                        this.isAddressSameAsShipping(true);
                    },
                    editAddress: function () {
                        this.isAddressSameAsShipping(false);
                    },
                    cancelAddressEdit: function () {
                        this.isAddressSameAsShipping(true);
                    }
                };
                return component;
            }

            function getBillingAddressComponent() {
                var component;

                try {
                    component = registry.get('index = billingAddress');
                } catch (e) {
                    component = null;
                }

                if (!component) {
                    component = createBillingAddressComponentFallback();
                    try {
                        registry.set('fastcheckout.billingAddress', component);
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: could not register fallback billingAddress component.', e);
                        }
                    }
                }

                return component;
            }

            getCheckoutProvider();
            getShippingAddressComponent();
            getBillingAddressComponent();

            window.fastcheckoutHyvaPayment = window.fastcheckoutHyvaPayment || {};

            function rememberLoadedRendererComponent(component) {
                if (!component) {
                    return;
                }

                loadedRendererComponents[component] = true;
                if (window.fastcheckoutKoLoadedPaymentRendererComponents.indexOf(component) === -1) {
                    window.fastcheckoutKoLoadedPaymentRendererComponents.push(component);
                }
            }

            function getRendererComponentForMethod(methodCode) {
                var normalizedMethod,
                    matchedComponent = '';

                if (!methodCode) {
                    return '';
                }

                normalizedMethod = String(methodCode);
                if (rendererComponentsByMethod[normalizedMethod]) {
                    return rendererComponentsByMethod[normalizedMethod];
                }

                rendererComponentEntries.some(function (entry) {
                    var base = entry && entry.method ? String(entry.method) : '';

                    if (!base || !entry.component || !entry.matchPrefix) {
                        return false;
                    }

                    if (
                        normalizedMethod.indexOf(base + '_') === 0 ||
                        normalizedMethod.indexOf(base + '-') === 0
                    ) {
                        matchedComponent = entry.component;
                        return true;
                    }

                    return false;
                });

                if (matchedComponent) {
                    return matchedComponent;
                }

                rendererComponentEntries.some(function (entry) {
                    var token = entry && entry.method ? String(entry.method) : '';

                    if (!token || !entry.component || !entry.matchContains) {
                        return false;
                    }

                    if (
                        normalizedMethod.indexOf('_' + token) !== -1 ||
                        normalizedMethod.indexOf('-' + token) !== -1 ||
                        normalizedMethod.indexOf(token + '_') === 0 ||
                        normalizedMethod.indexOf(token + '-') === 0
                    ) {
                        matchedComponent = entry.component;
                        return true;
                    }

                    return false;
                });

                return matchedComponent;
            }

            function loadRendererForMethod(methodCode) {
                var component = getRendererComponentForMethod(methodCode),
                    deferred;

                if (!component) {
                    return $.Deferred().resolve(false).promise();
                }

                if (loadedRendererComponents[component]) {
                    return $.Deferred().resolve(true).promise();
                }

                if (loadingRendererComponents[component]) {
                    return loadingRendererComponents[component];
                }

                deferred = $.Deferred();
                loadingRendererComponents[component] = deferred.promise();

                require([component], function () {
                    rememberLoadedRendererComponent(component);
                    delete loadingRendererComponents[component];
                    runPatchRenderers();
                    runSyncPaymentRenderers();
                    deferred.resolve(true);
                }, function (error) {
                    delete loadingRendererComponents[component];
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Kkkonrad Fastcheckout: payment renderer could not be loaded', component, error);
                    }
                    deferred.resolve(false);
                });

                return deferred.promise();
            }

            function ensureRendererForMethod(methodCode) {
                return loadRendererForMethod(methodCode).then(function () {
                    return true;
                });
            }

            function runPatchRenderers() {
                if (typeof patchRenderersHandler === 'function') {
                    patchRenderersHandler();
                }
            }

            function runSyncPaymentRenderers() {
                if (typeof syncPaymentRenderersHandler === 'function') {
                    syncPaymentRenderersHandler();
                }
            }

            function loadRendererComponents(done) {
                rendererComponents.forEach(function (component) {
                    if (!rendererComponentMap.length && component) {
                        rememberLoadedRendererComponent(component);
                    }
                });
                done();
            }

            loadRendererComponents(function () {
                // Initialize customerData dynamically if available
                require(['Magento_Customer/js/customer-data'], function (customerData) {
                    if (customerData) {
                        var cdInitFunc = typeof customerData === 'function' ? customerData : customerData['Magento_Customer/js/customer-data'];
                        if (typeof cdInitFunc === 'function') {
                            var customerDataConfig = $.extend({
                                cookieLifeTime: '3600',
                                expirableSectionNames: ['cart'],
                                expirableSectionLifetime: 60,
                                cookieDomain: '',
                                isLoggedIn: window.isCustomerLoggedIn,
                                sectionLoadUrl: (window.BASE_URL || '/') + 'customer/section/load/'
                            }, window.checkoutConfig.customerData || {});
                            try {
                                cdInitFunc(customerDataConfig);
                                
                            } catch (e) {
                                if (window.console && typeof window.console.warn === 'function') {
                                    window.console.warn('Kkkonrad Fastcheckout: customerData initialization error:', e);
                                }
                            }
                        }
                    }
                });

                var lastMethodsJson = '';
                var lastMagewireShippingMethodCode = '';
                var magewireShippingMethodSyncTimer = null;
                var lastMagewirePaymentMethodCode = '';
                var magewirePaymentMethodSyncTimer = null;
                var isApplyingPaymentMethodFromBridge = false;
                var checkoutStateRefreshPromise = null;
                var checkoutStateLastPayload = null;
                var checkoutStateLastPayloadAt = 0;
                var checkoutDataFallbackWarningShown = false;
                var optionalValidationComponentsRequested = false;
                var optionalPaymentDataAssigners = [];
                var bridgeMessageContainer = new Messages();
                var standardShippingViewSelectMethod = null;
                var standardShippingInformationComponent = null;
                var standardEmailComponent = null;
                var localTranslations = {
                    'Checkout session is not ready. Please refresh the page and try again.': 'Sesja checkoutu nie jest gotowa. Odśwież stronę i spróbuj ponownie.',
                    'Please check the selected payment method and try again.': 'Sprawdź wybraną metodę płatności i spróbuj ponownie.',
                    'The selected payment method is not ready. Please try again.': 'Wybrana metoda płatności nie jest jeszcze gotowa. Spróbuj ponownie.',
                    'The selected payment method did not start order placement. Please try again.': 'Wybrana metoda płatności nie rozpoczęła składania zamówienia. Spróbuj ponownie.',
                    'We could not place your order. Please try again.': 'Nie udało się złożyć zamówienia. Spróbuj ponownie.',
                    'Something went wrong while processing your order. Please try again later.': 'Coś poszło nie tak podczas przetwarzania zamówienia. Spróbuj ponownie później.'
                };

                function isPolishLocale() {
                    var locale = (window.LOCALE || (window.checkoutConfig && window.checkoutConfig.locale) || '').toLowerCase();

                    return locale.indexOf('pl') === 0;
                }

                function translateFastcheckoutMessage(message) {
                    var translated;

                    if (!message) {
                        return '';
                    }

                    translated = $t(message);
                    if (translated !== message) {
                        return translated;
                    }

                    if (isPolishLocale() && localTranslations[message]) {
                        return localTranslations[message];
                    }

                    return translated;
                }

                function getMessageText(message) {
                    if (!message) {
                        return '';
                    }

                    if (typeof message === 'string') {
                        return translateFastcheckoutMessage(message);
                    }

                    if (message.message) {
                        return translateFastcheckoutMessage(message.message);
                    }

                    return String(message);
                }

                function dispatchPaymentMessage(type, message) {
                    var text = getMessageText(message);

                    if (!text) {
                        return;
                    }

                    document.dispatchEvent(new CustomEvent('fastcheckout:payment-message', {
                        detail: {
                            type: type,
                            message: text
                        }
                    }));

                    if (type === 'error') {
                        document.dispatchEvent(new CustomEvent('fastcheckout:payment-error', {
                            detail: {
                                message: text
                            }
                        }));
                    }
                }

                function subscribePaymentMessageContainer(messageContainer) {
                    if (!messageContainer || messageContainer.fastcheckoutHyvaSubscribed) {
                        return messageContainer;
                    }

                    messageContainer.fastcheckoutHyvaSubscribed = true;

                    if (
                        typeof messageContainer.errorMessages === 'function' &&
                        typeof messageContainer.errorMessages.subscribe === 'function'
                    ) {
                        messageContainer.errorMessages.subscribe(function (messages) {
                            if (messages && messages.length) {
                                dispatchPaymentMessage('error', messages[messages.length - 1]);
                            }
                        });
                    }

                    if (
                        typeof messageContainer.successMessages === 'function' &&
                        typeof messageContainer.successMessages.subscribe === 'function'
                    ) {
                        messageContainer.successMessages.subscribe(function (messages) {
                            if (messages && messages.length) {
                                dispatchPaymentMessage('success', messages[messages.length - 1]);
                            }
                        });
                    }

                    return messageContainer;
                }

                function getBridgeMessageContainer() {
                    return subscribePaymentMessageContainer(bridgeMessageContainer);
                }

                function getCheckoutErrorsComponent() {
                    var component;

                    try {
                        component = registry.get('checkout.errors');
                    } catch (e) {
                        component = null;
                    }

                    if (!component) {
                        component = {
                            name: 'checkout.errors',
                            index: 'checkout.errors',
                            messageContainer: getBridgeMessageContainer()
                        };

                        try {
                            registry.set('checkout.errors', component);
                        } catch (e) {
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn('Kkkonrad Fastcheckout: could not register fallback checkout.errors component.', e);
                            }
                        }
                    } else if (!component.messageContainer) {
                        component.messageContainer = getBridgeMessageContainer();
                    } else {
                        subscribePaymentMessageContainer(component.messageContainer);
                    }

                    return component;
                }

                function clearPaymentMessages() {
                    if (bridgeMessageContainer && typeof bridgeMessageContainer.clear === 'function') {
                        bridgeMessageContainer.clear();
                    }
                    if (globalMessageList && typeof globalMessageList.clear === 'function') {
                        globalMessageList.clear();
                    }
                }

                function messageContainerHasMessages(messageContainer) {
                    return !!(
                        messageContainer &&
                        typeof messageContainer.hasMessages === 'function' &&
                        messageContainer.hasMessages()
                    );
                }

                function handlePaymentError(error, messageContainer) {
                    var container = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer(),
                        message = error && error.message
                            ? translateFastcheckoutMessage(error.message)
                            : translateFastcheckoutMessage('Something went wrong while processing your order. Please try again later.');

                    if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                        fullScreenLoader.stopLoader(true);
                    }

                    if (error && (error.responseText || error.status)) {
                        try {
                            errorProcessor.process(error, container);
                            return;
                        } catch (e) {}
                    }

                    if (messageContainerHasMessages(container)) {
                        return;
                    }

                    if (container && typeof container.addErrorMessage === 'function') {
                        container.addErrorMessage({ message: message });
                    } else {
                        dispatchPaymentMessage('error', message);
                    }
                }

                subscribePaymentMessageContainer(globalMessageList);
                getCheckoutErrorsComponent();

                function prepareShippingViewCompatibilityComponent() {
                    var component = getShippingAddressComponent(),
                        provider = getCheckoutProvider();

                    if (!component) {
                        return null;
                    }

                    component.source = provider;
                    component.isFormInline = true;
                    component.countryOptions = getCountryOptionsByValue();
                    component.messageContainer = component.messageContainer || getBridgeMessageContainer();

                    if (typeof component.errorValidationMessage !== 'function') {
                        component.errorValidationMessage = ko.observable(false);
                    }

                    if (typeof component.triggerShippingDataValidateEvent !== 'function') {
                        component.triggerShippingDataValidateEvent = function () {
                            if (provider && typeof provider.trigger === 'function') {
                                provider.trigger('shippingAddress.data.validate');
                                provider.trigger('shippingAddress.custom_attributes.data.validate');
                            }
                        };
                    }

                    if (typeof component.focusInvalid !== 'function') {
                        component.focusInvalid = function () {
                            var invalid = document.querySelector('#co-checkout-form [aria-invalid="true"], #co-checkout-form .mage-error, #co-checkout-form .field-error');

                            if (invalid) {
                                invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        };
                    }

                    getCheckoutErrorsComponent();

                    return component;
                }

                function registerShippingViewCompatibilityValidator() {
                    if (window.fastcheckoutKoShippingViewValidatorRegistered) {
                        return;
                    }

                    window.fastcheckoutKoShippingViewValidatorRegistered = true;
                    window.fastcheckoutCustomShippingValidators = window.fastcheckoutCustomShippingValidators || [];

                    require([
                        'Magento_Checkout/js/view/shipping'
                    ], function (ShippingView) {
                        var validateMethod = ShippingView &&
                                ShippingView.prototype &&
                                ShippingView.prototype.validateShippingInformation,
                            validator;

                        if (typeof validateMethod !== 'function') {
                            return;
                        }

                        standardShippingViewSelectMethod = ShippingView &&
                            ShippingView.prototype &&
                            typeof ShippingView.prototype.selectShippingMethod === 'function'
                            ? ShippingView.prototype.selectShippingMethod
                            : null;

                        validator = function () {
                            var component;

                            if (window.fastcheckoutKoShippingViewValidationActive) {
                                return true;
                            }

                            component = prepareShippingViewCompatibilityComponent();
                            if (!component) {
                                return true;
                            }

                            window.fastcheckoutKoShippingViewValidationActive = true;
                            try {
                                return validateMethod.call(component) !== false;
                            } catch (e) {
                                if (window.console && typeof window.console.warn === 'function') {
                                    window.console.warn('Kkkonrad Fastcheckout: standard shipping view validation could not run.', e);
                                }

                                return true;
                            } finally {
                                window.fastcheckoutKoShippingViewValidationActive = false;
                            }
                        };

                        validator.fastcheckoutKoShippingView = true;

                        if (!window.fastcheckoutCustomShippingValidators.some(function (item) {
                            return item && item.fastcheckoutKoShippingView;
                        })) {
                            window.fastcheckoutCustomShippingValidators.push(validator);
                        }
                    }, function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: standard shipping view validator could not be loaded.', error);
                        }
                    });
                }

                registerShippingViewCompatibilityValidator();

                function registerShippingInformationCompatibilityComponent() {
                    if (window.fastcheckoutKoShippingInformationRegistered) {
                        return;
                    }

                    window.fastcheckoutKoShippingInformationRegistered = true;

                    require([
                        'Magento_Checkout/js/view/shipping-information'
                    ], function (ShippingInformation) {
                        if (typeof ShippingInformation !== 'function') {
                            return;
                        }

                        try {
                            standardShippingInformationComponent = ShippingInformation({
                                name: 'fastcheckout.shippingInformation',
                                index: 'shipping-information',
                                displayArea: 'shipping-information'
                            });

                            if (standardShippingInformationComponent) {
                                registry.set('fastcheckout.shippingInformation', standardShippingInformationComponent);
                            }
                        } catch (e) {
                            standardShippingInformationComponent = null;
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn('Kkkonrad Fastcheckout: standard shipping information component could not be initialized.', e);
                            }
                        }
                    }, function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: standard shipping information component could not be loaded.', error);
                        }
                    });
                }

                registerShippingInformationCompatibilityComponent();

                function syncEmailCompatibilityComponent(value, triggerChange) {
                    var component = standardEmailComponent || window.fastcheckoutKoEmailCompatibilityComponent;

                    if (!component || typeof component.email !== 'function' || typeof value === 'undefined') {
                        return;
                    }

                    if (component.email() !== value) {
                        component.email(value || '');
                    }

                    if (triggerChange && typeof component.emailHasChanged === 'function') {
                        component.emailHasChanged();
                    }
                }

                function registerEmailCompatibilityComponent() {
                    if (window.fastcheckoutKoEmailComponentRegistered) {
                        return;
                    }

                    window.fastcheckoutKoEmailComponentRegistered = true;

                    require([
                        'Magento_Checkout/js/view/form/element/email'
                    ], function (EmailComponent) {
                        var input;

                        if (typeof EmailComponent !== 'function') {
                            return;
                        }

                        try {
                            standardEmailComponent = EmailComponent({
                                name: 'checkout.steps.shipping-step.shippingAddress.customer-email',
                                index: 'customer-email',
                                emailInputId: '#co-shipping-email'
                            });
                            window.fastcheckoutKoEmailCompatibilityComponent = standardEmailComponent;
                            registry.set('checkout.steps.shipping-step.shippingAddress.customer-email', standardEmailComponent);

                            input = document.getElementById('co-shipping-email');
                            if (input) {
                                syncEmailCompatibilityComponent(input.value || '', false);
                                input.addEventListener('input', function () {
                                    syncEmailCompatibilityComponent(input.value || '', true);
                                });
                                input.addEventListener('blur', function () {
                                    if (
                                        standardEmailComponent &&
                                        typeof standardEmailComponent.validateEmail === 'function'
                                    ) {
                                        standardEmailComponent.validateEmail(false);
                                    }
                                });
                            }
                        } catch (e) {
                            standardEmailComponent = null;
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn('Kkkonrad Fastcheckout: standard email component could not be initialized.', e);
                            }
                        }
                    }, function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: standard email component could not be loaded.', error);
                        }
                    });
                }

                registerEmailCompatibilityComponent();

                function runStandardShippingViewSelectMethod(shippingMethod) {
                    var component;

                    if (!standardShippingViewSelectMethod || window.fastcheckoutKoShippingViewSelectActive) {
                        return;
                    }

                    component = prepareShippingViewCompatibilityComponent();
                    if (!component) {
                        return;
                    }

                    window.fastcheckoutKoShippingViewSelectActive = true;
                    try {
                        standardShippingViewSelectMethod.call(component, shippingMethod);
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: standard shipping view method selection could not run.', e);
                        }
                    } finally {
                        window.fastcheckoutKoShippingViewSelectActive = false;
                    }
                }

                function registerAdditionalValidatorOnce(validator) {
                    if (!additionalValidators || !validator || typeof validator.validate !== 'function') {
                        return;
                    }

                    if (
                        typeof additionalValidators.getValidators === 'function' &&
                        additionalValidators.getValidators().indexOf(validator) !== -1
                    ) {
                        return;
                    }

                    if (typeof additionalValidators.registerValidator === 'function') {
                        additionalValidators.registerValidator(validator);
                    }
                }

                function registerPaymentDataAssignerOnce(assigner) {
                    if (typeof assigner !== 'function' || optionalPaymentDataAssigners.indexOf(assigner) !== -1) {
                        return;
                    }

                    optionalPaymentDataAssigners.push(assigner);
                }

                function loadOptionalValidationComponents() {
                    if (optionalValidationComponentsRequested) {
                        return;
                    }

                    optionalValidationComponentsRequested = true;

                    if (
                        !window.checkoutConfig ||
                        !window.checkoutConfig.checkoutAgreements ||
                        !window.checkoutConfig.checkoutAgreements.isEnabled
                    ) {
                        return;
                    }

                    require([
                        'Magento_CheckoutAgreements/js/model/agreement-validator',
                        'Magento_CheckoutAgreements/js/model/agreements-assigner'
                    ], function (agreementValidator, agreementsAssigner) {
                        registerAdditionalValidatorOnce(agreementValidator);
                        registerPaymentDataAssignerOnce(agreementsAssigner);
                    }, function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: optional checkout agreements validators could not be loaded.', error);
                        }
                    });
                }

                function loadShippingRatesValidationComponents() {
                    var components = config.shippingRatesValidationComponents || [];

                    if (window.fastcheckoutShippingRatesValidationComponentsLoaded || !components.length) {
                        return;
                    }

                    window.fastcheckoutShippingRatesValidationComponentsLoaded = true;
                    window.fastcheckoutShippingRatesValidationComponentNames = components.slice(0);
                    require(components, function () {}, function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn(
                                'Kkkonrad Fastcheckout: shipping rates validation components could not be loaded.',
                                error
                            );
                        }
                    });
                }

                function loadPaymentValidationComponents() {
                    var components = config.paymentValidationComponents || [];

                    if (window.fastcheckoutPaymentValidationComponentsLoaded || !components.length) {
                        return;
                    }

                    window.fastcheckoutPaymentValidationComponentsLoaded = true;
                    window.fastcheckoutPaymentValidationComponentNames = components.slice(0);
                    require(components, function () {}, function (error) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn(
                                'Kkkonrad Fastcheckout: payment validation components could not be loaded.',
                                error
                            );
                        }
                    });
                }

                function getDomPaymentMethods() {
                    var methods = [];

                    document.querySelectorAll('input[name="payment_method"]').forEach(function (input) {
                        var label = input.closest('label');
                        var titleElement = label ? label.querySelector('span') : null;

                        methods.push({
                            method: input.value,
                            title: titleElement ? titleElement.textContent.trim() : '',
                            checked: !!input.checked,
                            disabled: !!input.disabled
                        });
                    });

                    return methods;
                }

                function domHasPaymentMethod(methodCode) {
                    var found = false;

                    if (!methodCode) {
                        return false;
                    }

                    getDomPaymentMethods().forEach(function (method) {
                        if (method.method === methodCode && !method.disabled) {
                            found = true;
                        }
                    });

                    return found;
                }

                function getCheckedDomPaymentMethod() {
                    var selected = document.querySelector('input[name="payment_method"]:checked:not(:disabled)');

                    return selected ? selected.value : '';
                }

                function hidePaymentPlaceholders() {
                    document.querySelectorAll('.fastcheckout-payment-method-ko-container').forEach(function (placeholder) {
                        placeholder.classList.add('hidden');
                        placeholder.style.display = 'none';
                    });
                }

                function setQuoteGuestEmail(email) {
                    if (!quote || !email) {
                        return;
                    }

                    if (typeof quote.guestEmail === 'function') {
                        if (quote.guestEmail() !== email) {
                            quote.guestEmail(email);
                        }
                        return;
                    }

                    quote.guestEmail = email;
                }

                function syncQuoteCustomerData() {
                    if (!quote) return;
                    var emailEl = document.querySelector('input[name="email"]') || 
                                  document.querySelector('input[type="email"]') ||
                                  document.querySelector('[data-wire-field="email"]');
                    var emailVal = emailEl ? emailEl.value : '';
                    if (!emailVal && window.checkoutConfig && window.checkoutConfig.customerData) {
                        emailVal = window.checkoutConfig.customerData.email || '';
                    }
                    if (!emailVal && window.checkoutConfig && window.checkoutConfig.quoteData) {
                        emailVal = window.checkoutConfig.quoteData.customer_email || '';
                    }
                    if (emailVal) {
                        setQuoteGuestEmail(emailVal);
                        persistEmailToCheckoutData(emailVal);
                        var billing = typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;
                        if (billing && typeof billing.getCacheKey === 'function') {
                            billing.email = emailVal;
                        }
                    }
                }

                document.addEventListener('input', function (e) {
                    if (e.target && (e.target.name === 'email' || e.target.type === 'email' || e.target.getAttribute('data-wire-field') === 'email')) {
                        syncQuoteCustomerData();
                    }
                });

                function syncKoPaymentRenderers() {
                    syncQuoteCustomerData();
                    if (window.fastcheckoutHyvaPaymentList && typeof window.fastcheckoutHyvaPaymentList.syncRenderers === 'function') {
                        window.fastcheckoutHyvaPaymentList.syncRenderers();
                    }
                }

                function normalizeTotalsData(totalsData) {
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

                function getCheckoutConfigTotalsData() {
                    if (window.checkoutConfig && window.checkoutConfig.totalsData) {
                        return window.checkoutConfig.totalsData;
                    }
                    if (config.checkoutConfig && config.checkoutConfig.totalsData) {
                        return config.checkoutConfig.totalsData;
                    }

                    return null;
                }

                function readSummaryTotalsFromDom() {
                    var rows = document.querySelectorAll('[data-fastcheckout-total-row]'),
                        currentTotals = quote && typeof quote.totals === 'function' ? quote.totals() : null,
                        data,
                        segmentsByCode = {};

                    if (!rows.length) {
                        return null;
                    }

                    data = normalizeTotalsData(currentTotals || getCheckoutConfigTotalsData());
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

                    return normalizeTotalsData(data);
                }

                function syncQuoteTotals(totalsData) {
                    var data = normalizeTotalsData(totalsData);

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

                function syncQuoteTotalsFromConfig() {
                    var totalsData = getCheckoutConfigTotalsData();

                    if (!totalsData) {
                        return false;
                    }

                    return syncQuoteTotals(totalsData);
                }

                function syncQuoteTotalsFromDom() {
                    var totalsData = readSummaryTotalsFromDom();

                    if (!totalsData) {
                        return false;
                    }

                    return syncQuoteTotals(totalsData);
                }

                function applyCheckoutStatePayload(payload) {
                    var methodsJson;

                    if (!payload || typeof payload !== 'object') {
                        syncQuoteTotalsFromDom();
                        syncPaymentMethods();
                        return false;
                    }

                    if (payload.totals) {
                        syncQuoteTotals(payload.totals);
                    } else {
                        syncQuoteTotalsFromDom();
                    }

                    if (Array.isArray(payload.payment_methods)) {
                        paymentService.setPaymentMethods(payload.payment_methods);
                        methodsJson = JSON.stringify(payload.payment_methods);
                        if (methodsJson) {
                            lastMethodsJson = methodsJson;
                        }
                    } else {
                        syncPaymentMethods();
                    }

                    if (Array.isArray(payload.shipping_rates)) {
                        var currentRates = shippingService.getShippingRates()();
                        var ratesChanged = false;

                        if (currentRates.length !== payload.shipping_rates.length) {
                            ratesChanged = true;
                        } else {
                            for (var i = 0; i < currentRates.length; i++) {
                                var cr = currentRates[i];
                                var nr = payload.shipping_rates[i];
                                if (cr.carrier_code !== nr.carrier_code ||
                                    cr.method_code !== nr.method_code ||
                                    cr.amount !== nr.amount ||
                                    cr.available !== nr.available) {
                                    ratesChanged = true;
                                    break;
                                }
                            }
                        }

                        if (ratesChanged) {
                            shippingService.setShippingRates(payload.shipping_rates);
                        }
                    }

                    if (payload.selected_payment_method) {
                        setQuotePaymentMethodFromBridge({
                            method: payload.selected_payment_method
                        });
                        persistPaymentMethodToCheckoutData(payload.selected_payment_method);
                    }

                    if (typeof payload.coupon_code !== 'undefined' && window.checkoutConfig && window.checkoutConfig.totalsData) {
                        window.checkoutConfig.totalsData.coupon_code = payload.coupon_code || '';
                    }

                    return true;
                }

                function refreshCheckoutStateFromMagewire() {
                    var wire = getMagewireComponent();

                    if (!wire || typeof wire.call !== 'function') {
                        applyCheckoutStatePayload(null);
                        return Promise.resolve(false);
                    }

                    if (checkoutStateLastPayload && Date.now() - checkoutStateLastPayloadAt < 750) {
                        return Promise.resolve(checkoutStateLastPayload);
                    }

                    if (checkoutStateRefreshPromise) {
                        return checkoutStateRefreshPromise;
                    }

                    checkoutStateRefreshPromise = Promise.resolve(wire.call('refreshCheckoutState'))
                        .then(function (payload) {
                            if (payload && typeof payload === 'object' && payload.totals) {
                                return payload;
                            }
                            return fetchCheckoutState(wire);
                        })
                        .catch(function () {
                            return fetchCheckoutState(wire);
                        })
                        .then(function (payload) {
                            applyCheckoutStatePayload(payload);
                            checkoutStateLastPayload = payload;
                            checkoutStateLastPayloadAt = Date.now();
                            return payload;
                        })
                        .then(function (payload) {
                            checkoutStateRefreshPromise = null;
                            return payload;
                        }, function (error) {
                            checkoutStateRefreshPromise = null;
                            throw error;
                        });

                    return checkoutStateRefreshPromise;
                }

                function getCheckoutStateUrl(wire) {
                    var baseUrl = window.BASE_URL || '/',
                        paymentMethod = wire ? getProperty(wire, 'paymentMethod') : '';

                    if (baseUrl.charAt(baseUrl.length - 1) !== '/') {
                        baseUrl += '/';
                    }

                    return baseUrl + 'fast-checkout/index/state' + (paymentMethod ? '?payment_method=' + encodeURIComponent(paymentMethod) : '');
                }

                function fetchCheckoutState(wire) {
                    return $.ajax({
                        url: getCheckoutStateUrl(wire),
                        type: 'GET',
                        dataType: 'json',
                        cache: false
                    });
                }

                function resolveCheckoutStateRefresh(callbacks, deferred, messageContainer) {
                    var proceed = true;

                    callbacks = Array.isArray(callbacks) ? callbacks : [];
                    deferred = deferred || $.Deferred();

                    if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                        checkoutTotals.isLoading(true);
                    }

                    refreshCheckoutStateFromMagewire()
                        .then(function (payload) {
                            callbacks.forEach(function (callback) {
                                if (typeof callback === 'function') {
                                    proceed = proceed && callback();
                                }
                            });

                            if (!proceed) {
                                deferred.reject();
                                return;
                            }

                            if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                checkoutTotals.isLoading(false);
                            }
                            deferred.resolve(payload);
                        })
                        .catch(function (error) {
                            if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                checkoutTotals.isLoading(false);
                            }
                            handlePaymentError(error, messageContainer || getBridgeMessageContainer());
                            deferred.reject(error);
                        });

                    return deferred.promise();
                }

                function refreshShippingRatesFromMagewire() {
                    if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                        shippingService.isLoading(true);
                    }

                    return refreshCheckoutStateFromMagewire()
                        .then(function (payload) {
                            if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                                shippingService.isLoading(false);
                            }
                            return payload;
                        })
                        .catch(function (error) {
                            if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                                shippingService.isLoading(false);
                            }
                            handlePaymentError(error, getBridgeMessageContainer());
                            throw error;
                        });
                }

                function syncPaymentMethods() {
                    syncQuoteCustomerData();
                    var domMethods = getDomPaymentMethods();
                    var methods = domMethods.map(function (method) {
                        return {
                            method: method.method,
                            title: method.title
                        };
                    });
                    var currentMethodsJson = JSON.stringify(methods);
                    var quoteMethod = (quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()) ? quote.paymentMethod().method : '';

                    if (quoteMethod && !domHasPaymentMethod(quoteMethod)) {
                        
                        selectPaymentMethodAction(null);
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                    }

                    if (currentMethodsJson === lastMethodsJson) {
                        syncKoPaymentRenderers();
                        return domMethods;
                    }
                    lastMethodsJson = currentMethodsJson;

                    

                    if (methods.length > 0) {
                        paymentService.setPaymentMethods(methods);
                    } else {
                        var fallbackMethods = methodConverter(config.paymentMethods || window.checkoutConfig.paymentMethods || []);
                        paymentService.setPaymentMethods(fallbackMethods);
                    }

                    window.setTimeout(syncKoPaymentRenderers, 0);

                    return domMethods;
                }

                syncPaymentMethods();
                syncQuoteTotalsFromConfig();
                syncQuoteTotalsFromDom();
                loadShippingRatesValidationComponents();
                loadPaymentValidationComponents();

                var paymentListChildren = $.extend(true, {}, config.paymentListChildren || {});
                var paymentRegionChildren = $.extend(true, {}, config.paymentRegionChildren || {});
                var shippingListChildren = $.extend(true, {}, config.shippingListChildren || {});
                var shippingAddressChildren = $.extend(true, {}, config.shippingAddressChildren || {});
                paymentRegionChildren.paymentList = {
                    component: 'Kkkonrad_Fastcheckout/js/hyva/payment-list',
                    displayArea: 'payment-methods-list',
                    children: paymentListChildren
                };

                function getRegistryItem(name) {
                    try {
                        return registry.get(name);
                    } catch (error) {
                        return null;
                    }
                }

                function aliasRegistryComponent(sourceName, targetName) {
                    var source;

                    if (getRegistryItem(targetName)) {
                        return;
                    }

                    source = getRegistryItem(sourceName);
                    if (source) {
                        registry.set(targetName, source);
                    }
                }

                function aliasConfiguredComponentTree(children, sourcePrefix, targetPrefix) {
                    Object.keys(children || {}).forEach(function (childName) {
                        var sourceName = sourcePrefix + '.' + childName,
                            targetName = targetPrefix + '.' + childName,
                            child = children[childName] || {};

                        aliasRegistryComponent(sourceName, targetName);
                        if (child.children) {
                            aliasConfiguredComponentTree(child.children, sourceName, targetName);
                        }
                    });
                }

                function aliasStandardShippingRegistryPaths() {
                    aliasConfiguredComponentTree(
                        shippingListChildren,
                        'fastcheckoutHyvaShippingRenderers.shippingList',
                        'checkout.steps.shipping-step.shippingAddress'
                    );
                }

                registerCheckoutProviderAddressAttributeSync();

                app({
                    components: {
                        [scope]: {
                            component: 'uiComponent',
                            children: paymentRegionChildren
                        },
                        'fastcheckoutHyvaShippingRenderers': {
                            component: 'uiComponent',
                            children: {
                                shippingList: {
                                    component: 'Kkkonrad_Fastcheckout/js/hyva/shipping-list',
                                    displayArea: 'shipping-methods-list',
                                    children: shippingListChildren
                                }
                            }
                        },
                        'checkout': {
                            component: 'uiComponent',
                            children: {
                                steps: {
                                    component: 'uiComponent',
                                    children: {
                                        'shipping-step': {
                                            component: 'uiComponent',
                                            children: {
                                                shippingAddress: {
                                                    component: 'uiComponent',
                                                    children: shippingAddressChildren
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });

                [0, 50, 250, 750].forEach(function (delay) {
                    window.setTimeout(aliasStandardShippingRegistryPaths, delay);
                    window.setTimeout(registerCheckoutProviderAddressAttributeSync, delay);
                });

                function getProperty(wire, name) {
                    if (!wire) return '';
                    if (typeof wire[name] !== 'undefined') {
                        return wire[name];
                    }
                    if (typeof wire.get === 'function') {
                        return wire.get(name);
                    }
                    if (wire.data && typeof wire.data[name] !== 'undefined') {
                        return wire.data[name];
                    }
                    return '';
                }

                function getEmailForQuote() {
                    var emailEl = document.querySelector('input[name="email"]') ||
                        document.querySelector('input[type="email"]') ||
                        document.querySelector('[data-wire-field="email"]');

                    if (emailEl && emailEl.value) {
                        return emailEl.value;
                    }

                    if (quote && quote.guestEmail) {
                        return typeof quote.guestEmail === 'function' ? quote.guestEmail() : quote.guestEmail;
                    }

                    if (window.checkoutConfig && window.checkoutConfig.customerData && window.checkoutConfig.customerData.email) {
                        return window.checkoutConfig.customerData.email;
                    }

                    if (window.checkoutConfig && window.checkoutConfig.quoteData && window.checkoutConfig.quoteData.customer_email) {
                        return window.checkoutConfig.quoteData.customer_email;
                    }

                    return '';
                }

                function getStreetLines(magewire, prefix) {
                    var street = [],
                        isBilling = prefix === 'billing',
                        line1 = getProperty(magewire, isBilling ? 'billingStreet1' : 'street1'),
                        line2 = getProperty(magewire, isBilling ? 'billingStreet2' : 'street2'),
                        line3 = getProperty(magewire, isBilling ? 'billingStreet3' : 'street3'),
                        line4 = getProperty(magewire, isBilling ? 'billingStreet4' : 'street4');

                    [line1, line2, line3, line4].forEach(function (line) {
                        if (line) {
                            street.push(line);
                        }
                    });

                    return street;
                }

                function buildAddressData(magewire, prefix) {
                    var isBilling = prefix === 'billing',
                        countryId = getProperty(magewire, isBilling ? 'billingCountryId' : 'countryId'),
                        regionId = getProperty(magewire, isBilling ? 'billingRegionId' : 'regionId'),
                        region = getProperty(magewire, isBilling ? 'billingRegion' : 'region'),
                        customAttributes = getProperty(magewire, isBilling ? 'billingCustomAttributes' : 'shippingCustomAttributes') || {},
                        extensionAttributes = getProperty(magewire, isBilling ? 'billingExtensionAttributes' : 'shippingExtensionAttributes') || {};

                    return {
                        email: getEmailForQuote(),
                        firstname: getProperty(magewire, isBilling ? 'billingFirstname' : 'firstname'),
                        lastname: getProperty(magewire, isBilling ? 'billingLastname' : 'lastname'),
                        company: getProperty(magewire, isBilling ? 'billingCompany' : 'company'),
                        street: getStreetLines(magewire, prefix),
                        city: getProperty(magewire, isBilling ? 'billingCity' : 'city'),
                        postcode: getProperty(magewire, isBilling ? 'billingPostcode' : 'postcode'),
                        countryId: countryId,
                        country_id: countryId,
                        regionId: regionId && parseInt(regionId, 10) > 0 ? parseInt(regionId, 10) : null,
                        region_id: regionId && parseInt(regionId, 10) > 0 ? parseInt(regionId, 10) : null,
                        region: region,
                        telephone: getProperty(magewire, isBilling ? 'billingTelephone' : 'telephone'),
                        prefix: getProperty(magewire, isBilling ? 'billingPrefix' : 'prefix'),
                        middlename: getProperty(magewire, isBilling ? 'billingMiddlename' : 'middlename'),
                        suffix: getProperty(magewire, isBilling ? 'billingSuffix' : 'suffix'),
                        fax: getProperty(magewire, isBilling ? 'billingFax' : 'fax'),
                        vat_id: getProperty(magewire, isBilling ? 'billingVatId' : 'vatId'),
                        custom_attributes: customAttributes,
                        customAttributes: normalizeAddressCustomAttributes(customAttributes),
                        extension_attributes: extensionAttributes,
                        extensionAttributes: extensionAttributes,
                        save_in_address_book: 0
                    };
                }

                function getCheckoutDataFallbackStoreCode() {
                    return (window.checkoutConfig && window.checkoutConfig.storeCode) || 'default';
                }

                function readCheckoutDataFallback() {
                    var cache;

                    try {
                        cache = window.localStorage ? JSON.parse(window.localStorage.getItem('mage-cache-storage') || '{}') : {};
                    } catch (e) {
                        cache = {};
                    }

                    return {
                        cache: cache,
                        data: cache['checkout-data'] || {}
                    };
                }

                function writeCheckoutDataFallback(data) {
                    var fallback = readCheckoutDataFallback();

                    fallback.cache['checkout-data'] = data;

                    try {
                        if (window.localStorage) {
                            window.localStorage.setItem('mage-cache-storage', JSON.stringify(fallback.cache));
                        }
                    } catch (e) {}
                }

                function updateCheckoutDataFallback(update) {
                    var fallback = readCheckoutDataFallback();

                    update(fallback.data);
                    writeCheckoutDataFallback(fallback.data);
                }

                function setAddressByStoreFallback(currentValue, addressData) {
                    var byStore = currentValue || {};

                    byStore[getCheckoutDataFallbackStoreCode()] = addressData;
                    return byStore;
                }

                function safeCheckoutDataSet(methodName, value, fallback) {
                    if (checkoutData && typeof checkoutData[methodName] === 'function') {
                        try {
                            window.fastcheckoutSuppressCheckoutDataBridge = true;
                            checkoutData[methodName](value);
                            return;
                        } catch (e) {
                            if (!checkoutDataFallbackWarningShown && window.console && typeof window.console.warn === 'function') {
                                checkoutDataFallbackWarningShown = true;
                                window.console.warn(
                                    'Kkkonrad Fastcheckout: checkout-data storage is not ready, using local fallback.',
                                    e
                                );
                            }
                        } finally {
                            window.fastcheckoutSuppressCheckoutDataBridge = false;
                        }
                    }

                    if (typeof fallback === 'function') {
                        fallback(value);
                    }
                }

                function persistEmailToCheckoutData(email) {
                    if (!email) {
                        return;
                    }

                    safeCheckoutDataSet('setValidatedEmailValue', email, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.validatedEmailValue = value;
                        });
                    });
                    safeCheckoutDataSet('setInputFieldEmailValue', email, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.inputFieldEmailValue = value;
                        });
                    });
                }

                function persistAddressToCheckoutData(addressData, type) {
                    if (!addressData) {
                        return;
                    }

                    if (type === 'billing') {
                        safeCheckoutDataSet('setBillingAddressFromData', addressData, function (value) {
                            updateCheckoutDataFallback(function (data) {
                                data.billingAddressFromData = value;
                            });
                        });
                        safeCheckoutDataSet('setNewCustomerBillingAddress', addressData, function (value) {
                            updateCheckoutDataFallback(function (data) {
                                data.newCustomerBillingAddress = value;
                            });
                        });
                        return;
                    }

                    safeCheckoutDataSet('setShippingAddressFromData', addressData, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.shippingAddressFromData = setAddressByStoreFallback(data.shippingAddressFromData, value);
                        });
                    });
                    safeCheckoutDataSet('setNewCustomerShippingAddress', addressData, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.newCustomerShippingAddress = setAddressByStoreFallback(data.newCustomerShippingAddress, value);
                        });
                    });
                }

                function persistShippingMethodToCheckoutData(methodCode) {
                    safeCheckoutDataSet('setSelectedShippingRate', methodCode || null, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.selectedShippingRate = value;
                        });
                    });
                }

                function persistPaymentMethodToCheckoutData(methodCode) {
                    safeCheckoutDataSet('setSelectedPaymentMethod', methodCode || null, function (value) {
                        updateCheckoutDataFallback(function (data) {
                            data.selectedPaymentMethod = value;
                        });
                    });
                }

                function refreshCheckoutProviderDictionaries(provider) {
                    var countryOptions = getCountryDictionaryOptions(),
                        dictionaries;

                    if (!provider || !countryOptions.length) {
                        return;
                    }

                    dictionaries = provider.get && provider.get('dictionaries') ? provider.get('dictionaries') : {};
                    dictionaries.country_id = dictionaries.country_id && dictionaries.country_id.length
                        ? dictionaries.country_id
                        : countryOptions;

                    if (typeof provider.set === 'function') {
                        provider.set('dictionaries', dictionaries);
                        provider.set('dictionaries.country_id', dictionaries.country_id);
                    } else {
                        provider.dictionaries = dictionaries;
                    }
                }

                function syncAddressDataToCheckoutProvider(addressData, type) {
                    var provider = getCheckoutProvider(),
                        paymentMethods = getDomPaymentMethods(),
                        dataToSet;

                    if (!provider || !addressData) {
                        return;
                    }

                    refreshCheckoutProviderDictionaries(provider);
                    dataToSet = $.extend(true, {}, addressData);

                    if (type === 'billing') {
                        if (typeof provider.set === 'function') {
                            provider.set('billingAddress', dataToSet);
                            provider.set('billingAddressshared', dataToSet);
                            paymentMethods.forEach(function (method) {
                                if (method.method) {
                                    provider.set('billingAddress' + method.method, dataToSet);
                                }
                            });
                        }
                        return;
                    }

                    if (typeof provider.set === 'function') {
                        provider.set('shippingAddress', dataToSet);
                    } else {
                        provider.shippingAddress = dataToSet;
                    }
                }

                function getMagewireComponent() {
                    var magewireEl = document.querySelector('[wire\\:id]');

                    if (magewireEl && magewireEl.__livewire) {
                        return magewireEl.__livewire;
                    }

                    if (
                        magewireEl &&
                        window.Livewire &&
                        typeof window.Livewire.find === 'function' &&
                        magewireEl.getAttribute('wire:id')
                    ) {
                        return window.Livewire.find(magewireEl.getAttribute('wire:id'));
                    }

                    return null;
                }

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
                    var value = getAddressValue(address, camelKey, snakeKey);

                    if (!value && address && address[snakeKey]) {
                        value = address[snakeKey];
                    }

                    if (!value || typeof value !== 'object') {
                        return {};
                    }

                    return $.extend(true, {}, value);
                }

                function normalizeKoAddressData(address) {
                    if (!address) {
                        return null;
                    }

                    return {
                        firstname: getAddressValue(address, 'firstname') || '',
                        lastname: getAddressValue(address, 'lastname') || '',
                        company: getAddressValue(address, 'company') || '',
                        street: getAddressValue(address, 'street') || [],
                        city: getAddressValue(address, 'city') || '',
                        postcode: getAddressValue(address, 'postcode') || '',
                        country_id: getAddressValue(address, 'countryId', 'country_id') || '',
                        countryId: getAddressValue(address, 'countryId', 'country_id') || '',
                        region: getAddressValue(address, 'region') || '',
                        region_id: getAddressValue(address, 'regionId', 'region_id') || null,
                        regionId: getAddressValue(address, 'regionId', 'region_id') || null,
                        telephone: getAddressValue(address, 'telephone') || '',
                        prefix: getAddressValue(address, 'prefix') || '',
                        middlename: getAddressValue(address, 'middlename') || '',
                        suffix: getAddressValue(address, 'suffix') || '',
                        fax: getAddressValue(address, 'fax') || '',
                        vat_id: getAddressValue(address, 'vatId', 'vat_id') || '',
                        vatId: getAddressValue(address, 'vatId', 'vat_id') || '',
                        custom_attributes: normalizeAddressCustomAttributes(getAddressAttributes(address, 'customAttributes', 'custom_attributes')),
                        customAttributes: normalizeAddressCustomAttributes(getAddressAttributes(address, 'customAttributes', 'custom_attributes')),
                        extension_attributes: getAddressAttributes(address, 'extensionAttributes', 'extension_attributes'),
                        extensionAttributes: getAddressAttributes(address, 'extensionAttributes', 'extension_attributes')
                    };
                }

                function getCurrentShippingAddressData(address) {
                    var normalized = normalizeKoAddressData(address);

                    if (normalized) {
                        return normalized;
                    }

                    if (quote && typeof quote.shippingAddress === 'function' && quote.shippingAddress()) {
                        normalized = normalizeKoAddressData(quote.shippingAddress());
                        if (normalized) {
                            return normalized;
                        }
                    }

                    return buildAddressData(getMagewireComponent(), 'shipping');
                }

                function validateShippingRatesAddress(address, showMessage) {
                    var addressData;

                    if (
                        !shippingRatesValidator ||
                        typeof shippingRatesValidator.validateAddressData !== 'function'
                    ) {
                        return true;
                    }

                    addressData = getCurrentShippingAddressData(address);
                    if (shippingRatesValidator.validateAddressData(addressData)) {
                        return true;
                    }

                    if (showMessage) {
                        document.dispatchEvent(new CustomEvent('fastcheckout:shipping-error', {
                            detail: {
                                message: $t('Please check the shipping address and try again.')
                            }
                        }));
                    }

                    return false;
                }

                function setMagewireValue(wire, field, value, deferUpdate) {
                    var currentValue;

                    if (!wire || typeof wire.set !== 'function' || typeof value === 'undefined' || value === null) {
                        return null;
                    }

                    currentValue = getProperty(wire, field);
                    if (
                        (typeof currentValue === 'object' || typeof value === 'object') &&
                        JSON.stringify(currentValue || {}) === JSON.stringify(value || {})
                    ) {
                        return null;
                    }
                    if (
                        typeof currentValue !== 'object' &&
                        typeof value !== 'object' &&
                        String(currentValue || '') === String(value || '')
                    ) {
                        return null;
                    }

                    return wire.set(field, value, deferUpdate === true);
                }

                function writeKoAddressToMagewire(address, isBilling, deferUpdates) {
                    var wire = getMagewireComponent(),
                        prefix = isBilling ? 'billing' : '',
                        operations = [],
                        street,
                        customAttributes,
                        extensionAttributes,
                        fields;

                    if (!wire || !address) {
                        return Promise.resolve(false);
                    }

                    fields = [
                        ['countryId', 'country_id', prefix ? 'billingCountryId' : 'countryId'],
                        ['postcode', null, prefix ? 'billingPostcode' : 'postcode'],
                        ['city', null, prefix ? 'billingCity' : 'city'],
                        ['region', null, prefix ? 'billingRegion' : 'region'],
                        ['regionId', 'region_id', prefix ? 'billingRegionId' : 'regionId'],
                        ['firstname', null, prefix ? 'billingFirstname' : 'firstname'],
                        ['lastname', null, prefix ? 'billingLastname' : 'lastname'],
                        ['telephone', null, prefix ? 'billingTelephone' : 'telephone'],
                        ['company', null, prefix ? 'billingCompany' : 'company'],
                        ['prefix', null, prefix ? 'billingPrefix' : 'prefix'],
                        ['middlename', null, prefix ? 'billingMiddlename' : 'middlename'],
                        ['suffix', null, prefix ? 'billingSuffix' : 'suffix'],
                        ['fax', null, prefix ? 'billingFax' : 'fax'],
                        ['vatId', 'vat_id', prefix ? 'billingVatId' : 'vatId']
                    ];

                    fields.forEach(function (field) {
                        var operation = setMagewireValue(
                            wire,
                            field[2],
                            getAddressValue(address, field[0], field[1]),
                            deferUpdates === true
                        );
                        if (operation && typeof operation.then === 'function') {
                            operations.push(operation);
                        }
                    });

                    street = getAddressValue(address, 'street');
                    if (Array.isArray(street)) {
                        [
                            [prefix ? 'billingStreet1' : 'street1', street[0]],
                            [prefix ? 'billingStreet2' : 'street2', street[1]],
                            [prefix ? 'billingStreet3' : 'street3', street[2]],
                            [prefix ? 'billingStreet4' : 'street4', street[3]]
                        ].forEach(function (line) {
                            var operation = setMagewireValue(wire, line[0], line[1], deferUpdates === true);
                            if (operation && typeof operation.then === 'function') {
                                operations.push(operation);
                            }
                        });
                    }

                    customAttributes = normalizeAddressAttributeMap(getAddressAttributes(address, 'customAttributes', 'custom_attributes'));
                    extensionAttributes = getAddressAttributes(address, 'extensionAttributes', 'extension_attributes');

                    [
                        [prefix ? 'billingCustomAttributes' : 'shippingCustomAttributes', customAttributes],
                        [prefix ? 'billingExtensionAttributes' : 'shippingExtensionAttributes', extensionAttributes]
                    ].forEach(function (attributeData) {
                        var operation = setMagewireValue(wire, attributeData[0], attributeData[1], deferUpdates === true);
                        if (operation && typeof operation.then === 'function') {
                            operations.push(operation);
                        }
                    });

                    return operations.length ? Promise.all(operations) : Promise.resolve(true);
                }

                function registerKoStateAdapter() {
                    var isSyncingFromKo = false;

                    if (!quote || window.fastcheckoutKoStateAdapterRegistered) {
                        return;
                    }

                    window.fastcheckoutKoStateAdapterRegistered = true;

                    function syncKoAddressToMagewire(address, isBilling) {
                        if (isSyncingFromKo || !address) {
                            return;
                        }

                        isSyncingFromKo = true;
                        writeKoAddressToMagewire(address, isBilling)
                            .catch(function (e) {
                                if (window.console && typeof window.console.warn === 'function') {
                                    window.console.warn('Fastcheckout: Sync address to Magewire failed', e);
                                }
                            })
                            .then(function () {
                                isSyncingFromKo = false;
                            });
                    }

                    if (typeof quote.shippingAddress === 'function') {
                        quote.shippingAddress.subscribe(function (address) {
                            syncKoAddressToMagewire(address, false);
                        });
                    }

                    if (typeof quote.billingAddress === 'function') {
                        quote.billingAddress.subscribe(function (address) {
                            syncKoAddressToMagewire(address, true);
                        });
                    }

                    if (typeof quote.paymentMethod === 'function') {
                        quote.paymentMethod.subscribe(function (method) {
                            var wire,
                                methodCode;

                            if (isSyncingFromKo || isApplyingPaymentMethodFromBridge || !method) {
                                return;
                            }

                            wire = getMagewireComponent();
                            methodCode = method.method;
                            if (wire && methodCode && getProperty(wire, 'paymentMethod') !== methodCode) {
                                isSyncingFromKo = true;
                                Promise.resolve(wire.set('paymentMethod', methodCode))
                                    .then(function () {
                                        isSyncingFromKo = false;
                                    })
                                    .catch(function () {
                                        isSyncingFromKo = false;
                                    });
                            }
                        });
                    }
                }

                function registerKoFieldSyncBridge() {
                    window.fastcheckoutHyvaPayment = window.fastcheckoutHyvaPayment || {};
                    window.fastcheckoutHyvaPayment.syncFieldToKo = function (field, value) {
                        var shipping,
                            billing,
                            mapping,
                            billingMapping,
                            koField,
                            koFieldBilling,
                            street,
                            billingStreet,
                            currentPayment;

                        if (!quote) {
                            return;
                        }

                        shipping = typeof quote.shippingAddress === 'function' ? quote.shippingAddress() : null;
                        billing = typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;

                        if (field === 'email') {
                            setQuoteGuestEmail(value);
                            syncEmailCompatibilityComponent(value, false);
                        }

                        if (field === 'paymentMethod' && typeof quote.paymentMethod === 'function') {
                            currentPayment = quote.paymentMethod();
                            if (!currentPayment || currentPayment.method !== value) {
                                setQuotePaymentMethodFromBridge(value ? { method: value } : null);
                            }
                        }

                        mapping = {
                            'countryId': 'countryId',
                            'postcode': 'postcode',
                            'city': 'city',
                            'region': 'region',
                            'regionId': 'regionId',
                            'firstname': 'firstname',
                            'lastname': 'lastname',
                            'telephone': 'telephone',
                            'company': 'company'
                        };

                        if (shipping && mapping[field]) {
                            koField = mapping[field];
                            if (shipping[koField] !== value) {
                                shipping[koField] = value;
                                quote.shippingAddress.valueHasMutated();
                            }
                        }

                        billingMapping = {
                            'billingCountryId': 'countryId',
                            'billingPostcode': 'postcode',
                            'billingCity': 'city',
                            'billingRegion': 'region',
                            'billingRegionId': 'regionId',
                            'billingFirstname': 'firstname',
                            'billingLastname': 'lastname',
                            'billingTelephone': 'telephone',
                            'billingCompany': 'company'
                        };

                        if (billing && billingMapping[field]) {
                            koFieldBilling = billingMapping[field];
                            if (billing[koFieldBilling] !== value) {
                                billing[koFieldBilling] = value;
                                quote.billingAddress.valueHasMutated();
                            }
                        }

                        if (shipping && (field === 'street1' || field === 'street2')) {
                            street = shipping.street || [];
                            if (field === 'street1') {
                                street[0] = value;
                            }
                            if (field === 'street2') {
                                street[1] = value;
                            }
                            shipping.street = street;
                            quote.shippingAddress.valueHasMutated();
                        }

                        if (billing && (field === 'billingStreet1' || field === 'billingStreet2')) {
                            billingStreet = billing.street || [];
                            if (field === 'billingStreet1') {
                                billingStreet[0] = value;
                            }
                            if (field === 'billingStreet2') {
                                billingStreet[1] = value;
                            }
                            billing.street = billingStreet;
                            quote.billingAddress.valueHasMutated();
                        }
                    };
                }

                function registerCheckoutDataBufferBridge() {
                    var pending = window.fastcheckoutPendingCheckoutData || {
                        shippingAddress: null,
                        billingAddress: null,
                        selectedShippingRate: null,
                        selectedPaymentMethod: null,
                        email: null,
                        changed: false
                    };

                    if (window.fastcheckoutCheckoutDataBufferRegistered) {
                        return;
                    }

                    window.fastcheckoutPendingCheckoutData = pending;
                    window.fastcheckoutCheckoutDataBufferRegistered = true;
                    window.fastcheckoutCheckoutDataBufferReady = false;

                    window.fastcheckoutApplyPendingCheckoutData = function (wire) {
                        var shippingAddress,
                            billingAddress,
                            operations = [];

                        if (!wire || !pending.changed) {
                            return Promise.resolve(false);
                        }

                        if (pending.email) {
                            setQuoteGuestEmail(pending.email);
                            syncEmailCompatibilityComponent(pending.email, false);
                            operations.push(setMagewireValue(wire, 'email', pending.email, false));
                        }

                        if (pending.selectedPaymentMethod) {
                            setQuotePaymentMethodFromBridge({ method: pending.selectedPaymentMethod });
                            operations.push(setMagewireValue(wire, 'paymentMethod', pending.selectedPaymentMethod, false));
                        }

                        if (pending.selectedShippingRate) {
                            operations.push(setMagewireValue(wire, 'shippingMethod', pending.selectedShippingRate, false));
                        }

                        if (pending.shippingAddress) {
                            shippingAddress = addressConverter.formAddressDataToQuoteAddress(pending.shippingAddress);
                            syncAddressDataToCheckoutProvider(normalizeKoAddressData(shippingAddress), 'shipping');
                            operations.push(writeKoAddressToMagewire(shippingAddress, false, false));
                        }

                        if (pending.billingAddress) {
                            billingAddress = addressConverter.formAddressDataToQuoteAddress(pending.billingAddress);
                            syncAddressDataToCheckoutProvider(normalizeKoAddressData(billingAddress), 'billing');
                            operations.push(writeKoAddressToMagewire(billingAddress, true, false));
                        }

                        return Promise.all(operations.filter(Boolean)).then(function () {
                            pending.shippingAddress = null;
                            pending.billingAddress = null;
                            pending.selectedShippingRate = null;
                            pending.selectedPaymentMethod = null;
                            pending.email = null;
                            pending.changed = false;

                            return true;
                        });
                    };

                    window.addEventListener('fastcheckout:checkout-data-set', function (event) {
                        var detail = event.detail || {};

                        if (window.fastcheckoutSuppressCheckoutDataBridge || !detail.method) {
                            return;
                        }

                        switch (detail.method) {
                            case 'setShippingAddressFromData':
                            case 'setNewCustomerShippingAddress':
                                pending.shippingAddress = detail.value || null;
                                pending.changed = true;
                                break;

                            case 'setBillingAddressFromData':
                            case 'setNewCustomerBillingAddress':
                                pending.billingAddress = detail.value || null;
                                pending.changed = true;
                                break;

                            case 'setSelectedShippingRate':
                                pending.selectedShippingRate = detail.value || null;
                                pending.changed = true;
                                break;

                            case 'setSelectedPaymentMethod':
                                pending.selectedPaymentMethod = detail.value || null;
                                pending.changed = true;
                                break;

                            case 'setValidatedEmailValue':
                            case 'setInputFieldEmailValue':
                            case 'setCheckedEmailValue':
                                pending.email = detail.value || null;
                                pending.changed = true;
                                break;
                        }
                    });

                    pending.shippingAddress = null;
                    pending.billingAddress = null;
                    pending.selectedShippingRate = null;
                    pending.selectedPaymentMethod = null;
                    pending.email = null;
                    pending.changed = false;
                    window.fastcheckoutCheckoutDataBufferReady = true;
                }

                registerKoStateAdapter();
                registerKoFieldSyncBridge();
                registerCheckoutDataBufferBridge();

                function syncCheckoutStateWithoutServer(magewire) {
                    var shippingAddress;

                    syncQuoteCustomerData();

                    if (!magewire) {
                        return;
                    }

                    shippingAddress = syncAddressToKnockout(magewire);
                    syncBillingAddressToKnockout(magewire, shippingAddress);
                    syncSelectedShippingMethodToKnockout(getProperty(magewire, 'shippingMethod'));
                }

                function resolveAsKoDeferred(promise, messageContainer) {
                    var deferred = $.Deferred();

                    Promise.resolve(promise)
                        .then(function (result) {
                            if (fullScreenLoader && typeof fullScreenLoader.stopLoader === 'function') {
                                fullScreenLoader.stopLoader(true);
                            }
                            if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                checkoutTotals.isLoading(false);
                            }
                            deferred.resolve(result);
                        })
                        .catch(function (error) {
                            if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                checkoutTotals.isLoading(false);
                            }
                            handlePaymentError(error, messageContainer || getBridgeMessageContainer());
                            deferred.reject(error);
                        });

                    return deferred.promise();
                }

                function addressesMatch(currentAddress, newAddress) {
                    return currentAddress &&
                        currentAddress.countryId === newAddress.countryId &&
                        currentAddress.postcode === newAddress.postcode &&
                        currentAddress.city === newAddress.city &&
                        JSON.stringify(currentAddress.street || []) === JSON.stringify(newAddress.street || []) &&
                        currentAddress.regionId == newAddress.regionId &&
                        currentAddress.region === newAddress.region &&
                        currentAddress.firstname === newAddress.firstname &&
                        currentAddress.lastname === newAddress.lastname &&
                        currentAddress.telephone === newAddress.telephone;
                }

                function syncAddressToKnockout(magewire) {
                    if (!magewire) return null;

                    var addressData = buildAddressData(magewire, ''),
                        newAddress = addressConverter.formAddressDataToQuoteAddress(addressData),
                        currentAddress = quote.shippingAddress();

                    persistAddressToCheckoutData(addressData, 'shipping');
                    syncAddressDataToCheckoutProvider(addressData, 'shipping');

                    if (!addressesMatch(currentAddress, newAddress)) {
                        selectShippingAddressAction(newAddress);
                    }

                    return quote.shippingAddress() || newAddress;
                }

                function syncBillingAddressToKnockout(magewire, shippingAddress) {
                    var billingSameAsShipping = getProperty(magewire, 'billingSameAsShipping'),
                        newAddress,
                        currentAddress;

                    if (!magewire) return null;

                    if (billingSameAsShipping === true || billingSameAsShipping === '1' || billingSameAsShipping === 1) {
                        var shippingAddressData = buildAddressData(magewire, '');
                        persistAddressToCheckoutData(shippingAddressData, 'billing');
                        syncAddressDataToCheckoutProvider(shippingAddressData, 'billing');
                        if (shippingAddress) {
                            selectBillingAddressAction(shippingAddress);
                        }
                        return quote.billingAddress();
                    }

                    var addressData = buildAddressData(magewire, 'billing');
                    persistAddressToCheckoutData(addressData, 'billing');
                    syncAddressDataToCheckoutProvider(addressData, 'billing');

                    newAddress = addressConverter.formAddressDataToQuoteAddress(addressData);
                    currentAddress = quote.billingAddress();
                    if (!addressesMatch(currentAddress, newAddress)) {
                        selectBillingAddressAction(newAddress);
                    }

                    return quote.billingAddress() || newAddress;
                }

                function syncSelectedShippingMethodToKnockout(methodCode) {
                    persistShippingMethodToCheckoutData(methodCode);

                    if (!methodCode) {
                        quote.shippingMethod(null);
                        return;
                    }

                    var rates = shippingService.getShippingRates()(),
                        found = null;

                    rates.some(function (rate) {
                        if ((rate.carrier_code + '_' + rate.method_code) === methodCode) {
                            found = rate;
                            return true;
                        }
                        return false;
                    });

                    if (found) {
                        var active = quote.shippingMethod();
                        if (!active || active.carrier_code !== found.carrier_code || active.method_code !== found.method_code) {
                            selectShippingMethodAction(found);
                        }
                    }
                }

                function getShippingMethodCode(shippingMethod) {
                    if (!shippingMethod) {
                        return '';
                    }
                    if (typeof shippingMethod === 'string') {
                        return shippingMethod;
                    }
                    if (shippingMethod.carrier_code && shippingMethod.method_code) {
                        return shippingMethod.carrier_code + '_' + shippingMethod.method_code;
                    }
                    if (shippingMethod.carrierCode && shippingMethod.methodCode) {
                        return shippingMethod.carrierCode + '_' + shippingMethod.methodCode;
                    }
                    if (shippingMethod.method) {
                        return shippingMethod.method;
                    }

                    return '';
                }

                function syncShippingMethodToMagewireNow(methodCode) {
                    var wire,
                        currentMethod;

                    persistShippingMethodToCheckoutData(methodCode);

                    if (magewireShippingMethodSyncTimer) {
                        window.clearTimeout(magewireShippingMethodSyncTimer);
                        magewireShippingMethodSyncTimer = null;
                    }

                    if (!methodCode) {
                        return Promise.resolve(false);
                    }

                    wire = getMagewireComponent();
                    if (!wire || typeof wire.call !== 'function') {
                        return Promise.resolve(false);
                    }

                    currentMethod = getProperty(wire, 'shippingMethod');
                    lastMagewireShippingMethodCode = methodCode;

                    if (currentMethod === methodCode) {
                        return Promise.resolve(true);
                    }

                    return Promise.resolve(wire.call('selectShippingMethod', methodCode));
                }

                function syncShippingMethodToMagewire(methodCode) {
                    persistShippingMethodToCheckoutData(methodCode);

                    if (!methodCode || methodCode === lastMagewireShippingMethodCode) {
                        return;
                    }

                    lastMagewireShippingMethodCode = methodCode;

                    if (magewireShippingMethodSyncTimer) {
                        window.clearTimeout(magewireShippingMethodSyncTimer);
                    }

                    magewireShippingMethodSyncTimer = window.setTimeout(function () {
                        var magewireEl = document.querySelector('[wire\\:id]'),
                            wire,
                            currentMethod;

                        magewireShippingMethodSyncTimer = null;

                        if (!magewireEl || !magewireEl.__livewire) {
                            return;
                        }

                        wire = magewireEl.__livewire;
                        currentMethod = getProperty(wire, 'shippingMethod');
                        if (currentMethod !== methodCode && typeof wire.call === 'function') {
                            wire.call('selectShippingMethod', methodCode);
                        }
                    }, 0);
                }

                function buildShippingInformationResponse(payload) {
                    payload = payload && typeof payload === 'object' ? payload : {};

                    return {
                        totals: payload.totals || (quote && typeof quote.totals === 'function' ? quote.totals() : {}),
                        payment_methods: Array.isArray(payload.payment_methods) ? payload.payment_methods : []
                    };
                }

                function resolveShippingInformationAction(originalAction) {
                    var wire = getMagewireComponent(),
                        selectedMethod = quote && typeof quote.shippingMethod === 'function' ? quote.shippingMethod() : null,
                        methodCode = getShippingMethodCode(selectedMethod),
                        deferred = $.Deferred();

                    if (!wire || typeof wire.call !== 'function') {
                        return originalAction();
                    }

                    if (!methodCode) {
                        return originalAction();
                    }

                    syncShippingMethodToMagewireNow(methodCode)
                        .then(function () {
                            return originalAction();
                        })
                        .then(function (response) {
                            deferred.resolve(response);
                        })
                        .catch(function (error) {
                            handlePaymentError(error, getBridgeMessageContainer());
                            deferred.reject(error);
                        });

                    return deferred.promise();
                }

                function resolveShippingRatesEstimate(address) {
                    var wire = getMagewireComponent();

                    if (!validateShippingRatesAddress(address, false)) {
                        if (shippingService && shippingService.isLoading && typeof shippingService.isLoading === 'function') {
                            shippingService.isLoading(false);
                        }
                        if (shippingService && typeof shippingService.setShippingRates === 'function') {
                            shippingService.setShippingRates([]);
                        }

                        return Promise.resolve([]);
                    }

                    return writeKoAddressToMagewire(address, false)
                        .then(function () {
                            if (wire && typeof wire.call === 'function') {
                                return wire.call('saveShippingAddress', true, true, true);
                            }

                            return true;
                        })
                        .then(function () {
                            return refreshCheckoutStateFromMagewire();
                        })
                        .then(function (payload) {
                            payload = payload && typeof payload === 'object' ? payload : {};

                            return Array.isArray(payload.shipping_rates) ? payload.shipping_rates : [];
                        });
                }

                function getPaymentMethodCode(paymentMethod) {
                    if (!paymentMethod) {
                        return '';
                    }
                    if (typeof paymentMethod === 'string') {
                        return paymentMethod;
                    }

                    return paymentMethod.method || '';
                }

                function getQuotePaymentMethodCode() {
                    var current = quote && typeof quote.paymentMethod === 'function' ? quote.paymentMethod() : null;

                    return getPaymentMethodCode(current);
                }

                function setQuotePaymentMethodFromBridge(paymentMethod) {
                    var methodCode = getPaymentMethodCode(paymentMethod);

                    if (!quote || typeof quote.paymentMethod !== 'function') {
                        return;
                    }

                    if (getQuotePaymentMethodCode() === methodCode) {
                        lastMagewirePaymentMethodCode = methodCode;
                        return;
                    }

                    isApplyingPaymentMethodFromBridge = true;
                    try {
                        quote.paymentMethod(methodCode ? paymentMethod : null);
                        lastMagewirePaymentMethodCode = methodCode;
                    } finally {
                        isApplyingPaymentMethodFromBridge = false;
                    }
                }

                function syncPaymentMethodToMagewire(paymentMethod) {
                    var methodCode = getPaymentMethodCode(paymentMethod);

                    persistPaymentMethodToCheckoutData(methodCode || null);

                    if (!methodCode) {
                        lastMagewirePaymentMethodCode = '';
                        if (magewirePaymentMethodSyncTimer) {
                            window.clearTimeout(magewirePaymentMethodSyncTimer);
                        }
                        magewirePaymentMethodSyncTimer = window.setTimeout(function () {
                            var wire = getMagewireComponent();

                            magewirePaymentMethodSyncTimer = null;
                            if (wire && typeof wire.set === 'function') {
                                wire.set('paymentMethod', '');
                            }
                        }, 50);
                        return;
                    }

                    if (methodCode === lastMagewirePaymentMethodCode) {
                        return;
                    }

                    lastMagewirePaymentMethodCode = methodCode;

                    if (magewirePaymentMethodSyncTimer) {
                        window.clearTimeout(magewirePaymentMethodSyncTimer);
                    }

                    magewirePaymentMethodSyncTimer = window.setTimeout(function () {
                        var wire = getMagewireComponent(),
                            currentMethod;

                        magewirePaymentMethodSyncTimer = null;

                        if (!wire || typeof wire.call !== 'function') {
                            return;
                        }

                        currentMethod = getProperty(wire, 'paymentMethod');
                        if (currentMethod !== methodCode) {
                            wire.call('selectPaymentMethod', methodCode);
                        }
                    }, 50);
                }

                function prepareCheckoutState(magewire) {
                    syncQuoteCustomerData();

                    return Promise.resolve(
                        magewire && typeof window.fastcheckoutApplyPendingCheckoutData === 'function'
                            ? window.fastcheckoutApplyPendingCheckoutData(magewire)
                            : true
                    ).then(function () {
                        var shippingAddress = syncAddressToKnockout(magewire);
                        syncBillingAddressToKnockout(magewire, shippingAddress);

                        if (magewire) {
                            syncSelectedShippingMethodToKnockout(getProperty(magewire, 'shippingMethod'));
                        }

                        if (quote.isVirtual && quote.isVirtual()) {
                            return true;
                        }

                        if (!quote.shippingAddress() || !quote.shippingMethod()) {
                            return true;
                        }

                        try {
                            return Promise.resolve(setShippingInformationAction()).then(function () {
                                syncPaymentMethods();
                                if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                    checkoutTotals.isLoading(false);
                                }
                                return true;
                            });
                        } catch (e) {
                            return Promise.reject(e);
                        }
                    });
                }

                function getShippingListComponent() {
                    return window.fastcheckoutHyvaShippingListInstance || (typeof registry !== 'undefined' && registry.get('fastcheckoutHyvaShippingRenderers.shippingList')) || null;
                }

                function clearShippingFieldError() {
                    var component = getShippingListComponent();
                    if (component && typeof component.clearError === 'function') {
                        component.clearError();
                    }
                }

                function showShippingFieldError(methodCode, carrierCode, errorMessage) {
                    var component = getShippingListComponent();
                    if (component && typeof component.setError === 'function') {
                        component.setError(carrierCode + '_' + methodCode, errorMessage);
                    }
                    var el = document.getElementById('label_method_' + methodCode + '_' + carrierCode) ||
                             document.getElementById('fastcheckout-ko-shipping-root') ||
                             document.querySelector('[name="shipping_method"]');
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }

                window.fastcheckoutHyvaShipping = {
                    syncAddress: syncAddressToKnockout,
                    syncShippingMethod: syncSelectedShippingMethodToKnockout,
                    syncShippingMethodToMagewire: syncShippingMethodToMagewire,
                    getShippingInformationComponent: function () {
                        return standardShippingInformationComponent;
                    },
                    onSelectShippingAddressAction: function (shippingAddress) {
                        var addressData = normalizeKoAddressData(shippingAddress);

                        persistAddressToCheckoutData(addressData, 'shipping');
                        syncAddressDataToCheckoutProvider(addressData, 'shipping');

                        return writeKoAddressToMagewire(shippingAddress, false);
                    },
                    onSelectBillingAddressAction: function (billingAddress) {
                        var addressData = normalizeKoAddressData(billingAddress);

                        persistAddressToCheckoutData(addressData, 'billing');
                        syncAddressDataToCheckoutProvider(addressData, 'billing');

                        return writeKoAddressToMagewire(billingAddress, true);
                    },
                    onSelectShippingMethodAction: function (shippingMethod) {
                        syncShippingMethodToMagewire(getShippingMethodCode(shippingMethod));
                        runStandardShippingViewSelectMethod(shippingMethod);
                    },
                    onSetShippingInformationAction: function (originalAction) {
                        return resolveShippingInformationAction(originalAction);
                    },
                    onEstimateShippingRatesAction: function (address) {
                        return resolveShippingRatesEstimate(address);
                    },
                    onRecollectShippingRatesAction: function (originalAction) {
                        if (!getMagewireComponent()) {
                            return originalAction();
                        }

                        return refreshShippingRatesFromMagewire();
                    },
                    setError: function (methodCode, message) {
                        showShippingFieldError(methodCode, '', message);
                    },
                    clearError: clearShippingFieldError,
                    validate: function () {
                        try {
                            clearShippingFieldError();
                            var checkedDomRadio = document.querySelector('input[name="shipping_method"]:checked');
                            var activeMethod = quote.shippingMethod();

                            var carrierCode = '';
                            var methodCode = '';

                            if (checkedDomRadio && checkedDomRadio.value) {
                                var parts = checkedDomRadio.value.split('_');
                                carrierCode = parts[0] || '';
                                methodCode = parts[1] || parts[0] || '';
                            } else if (activeMethod) {
                                carrierCode = activeMethod.carrier_code || '';
                                methodCode = activeMethod.method_code || '';
                            }

                            if (!carrierCode) {
                                return true;
                            }

                            // InPost locker point selection validation
                            var fullMethodCode = (methodCode + '_' + carrierCode).toLowerCase();
                            var isInPostLocker = fullMethodCode.indexOf('inpostlocker') !== -1 || 
                                                 fullMethodCode.indexOf('paczkomat') !== -1 || 
                                                 (fullMethodCode.indexOf('inpost') !== -1 && (fullMethodCode.indexOf('locker') !== -1 || fullMethodCode.indexOf('box') !== -1 || fullMethodCode.indexOf('point') !== -1));
                            if (isInPostLocker) {
                                var pointData = null;
                                if (checkoutData && typeof checkoutData.getShippingInPostPoint === 'function') {
                                    pointData = checkoutData.getShippingInPostPoint();
                                }

                                if (!pointData || !pointData.name || pointData.name.length === 0) {
                                    showShippingFieldError(methodCode, carrierCode, $t('Please select a pickup point'));
                                    return false;
                                }

                                var fullMethodCodeRaw = methodCode + '_' + carrierCode;
                                if (fullMethodCodeRaw.indexOf('cod') !== -1) {
                                    if (pointData.type && !pointData.type.includes('parcel_locker')) {
                                        showShippingFieldError(methodCode, carrierCode, $t('The selected point does not support the cash on delivery method'));
                                        return false;
                                    }
                                }
                            }
                        } catch (e) {
                            if (window.console && typeof window.console.error === 'function') {
                                window.console.error('Kkkonrad Fastcheckout: Error in shipping validation:', e);
                            }
                        }

                        // Run dynamic/custom shipping validators if registered
                        if (window.fastcheckoutCustomShippingValidators && window.fastcheckoutCustomShippingValidators.length > 0) {
                            for (var i = 0; i < window.fastcheckoutCustomShippingValidators.length; i++) {
                                var validator = window.fastcheckoutCustomShippingValidators[i];
                                if (typeof validator === 'function') {
                                    try {
                                        if (!validator(activeMethod)) {
                                            return false;
                                        }
                                    } catch (err) {
                                        if (window.console && typeof window.console.error === 'function') {
                                            window.console.error('Kkkonrad Fastcheckout: Custom shipping validator error:', err);
                                        }
                                    }
                                }
                            }
                        }

                        if (!validateShippingRatesAddress(null, true)) {
                            return false;
                        }

                        return true;
                    }
                };

                // Initial sync once Knockout is ready
                var magewireEl = document.querySelector('[wire\\:id]');
                if (magewireEl && magewireEl.__livewire) {
                    var wire = magewireEl.__livewire;
                    syncAddressToKnockout(wire);
                    var initMethod = wire.shippingMethod || getProperty(wire, 'shippingMethod');
                    if (initMethod) {
                        syncSelectedShippingMethodToKnockout(initMethod);
                    }
                }

                quote.shippingMethod.subscribe(function (method) {
                    clearShippingFieldError();
                    if (!method) {
                        persistShippingMethodToCheckoutData(null);
                        return;
                    }

                    if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                        checkoutTotals.isLoading(true);
                    }
                    syncShippingMethodToMagewire(method.carrier_code + '_' + method.method_code);
                });

                shippingService.getShippingRates().subscribe(function () {
                    var magewireEl = document.querySelector('[wire\\:id]');
                    if (magewireEl && magewireEl.__livewire) {
                        var wire = magewireEl.__livewire;
                        if (wire.shippingMethod) {
                            syncSelectedShippingMethodToKnockout(wire.shippingMethod);
                        }
                    }
                });

                function getSelectedMethodCode() {
                    var quoteMethod = (quote && typeof quote.paymentMethod === 'function' && quote.paymentMethod()) ? quote.paymentMethod().method : '';
                    var domMethod = getCheckedDomPaymentMethod();

                    

                    if (domMethod) {
                        return domMethod;
                    }

                    return domHasPaymentMethod(quoteMethod) ? quoteMethod : '';
                }

                function getMethod(methodCode) {
                    return methodList().filter(function (method) {
                        return method.method === methodCode;
                    })[0] || null;
                }

                function getRendererByMethod(methodCode) {
                    var found = null;

                    registry.get(function (component) {
                        var rendererCode;

                        if (found || !component || !component.item || !component.item.method) {
                            return;
                        }

                        rendererCode = typeof component.getCode === 'function' ? component.getCode() : '';

                        if (component.item.method === methodCode || rendererCode === methodCode) {
                            found = component;
                        }
                    });

                    return found;
                }

                function getRendererCode(component, fallbackCode) {
                    var rendererCode = component && typeof component.getCode === 'function' ? component.getCode() : '';

                    return rendererCode || fallbackCode;
                }

                function patchRenderer(component) {
                    if (!component || component.fastcheckoutHyvaPatched) {
                        if (component && component.messageContainer) {
                            subscribePaymentMessageContainer(component.messageContainer);
                        }
                        return;
                    }

                    component.fastcheckoutHyvaPatched = true;
                    if (component.messageContainer) {
                        subscribePaymentMessageContainer(component.messageContainer);
                    }
                    component.selectPaymentMethod = function () {
                        syncQuoteCustomerData();
                        var paymentData = typeof component.getData === 'function'
                            ? component.getData()
                            : { method: component.item ? component.item.method : null },
                            rendererCode = getRendererCode(component, paymentData.method);

                        if (paymentData && paymentData.method) {
                            selectPaymentMethodAction(paymentData);
                            persistPaymentMethodToCheckoutData(rendererCode);
                            quote.paymentMethod({
                                method: rendererCode,
                                title: component.item ? component.item.title : null
                            });
                        }

                        return true;
                    };
                }

                function patchRenderers() {
                    registry.get(function (component) {
                        if (component && component.item && component.item.method) {
                            patchRenderer(component);
                        }
                    });
                }

                patchRenderersHandler = patchRenderers;
                syncPaymentRenderersHandler = syncKoPaymentRenderers;

                function elementMatchesMethod(element, methodCode, activeCode) {
                    var inputs = element.querySelectorAll('input'),
                        matches = false;

                    if (element.id === methodCode || element.id === activeCode) {
                        return true;
                    }

                    inputs.forEach(function (input) {
                        if (matches) {
                            return;
                        }

                        matches = input.id === methodCode ||
                            input.id === activeCode ||
                            input.value === methodCode ||
                            input.value === activeCode ||
                            input.getAttribute('value') === methodCode ||
                            input.getAttribute('value') === activeCode;
                    });

                    return matches;
                }

                function hasVisibleContent(element) {
                    var content = element.querySelector('.payment-method-content');
                    if (!content) {
                        return false;
                    }

                    // 1. Check if there are any input, select, or textarea elements
                    if (content.querySelector('input:not([type="hidden"]), select, textarea')) {
                        return true;
                    }

                    // 2. Clone the content to inspect remaining elements/text
                    var clone = content.cloneNode(true);

                    // Remove components we explicitly hide or handle globally
                    var selectorsToRemove = [
                        '.payment-method-title',
                        '.actions-toolbar',
                        '.payment-method-billing-address'
                    ];
                    selectorsToRemove.forEach(function (selector) {
                        clone.querySelectorAll(selector).forEach(function (el) {
                            el.remove();
                        });
                    });

                    // 3. Check for any elements indicating actual content or custom containers (e.g. form structures)
                    var hasContent = false;
                    clone.querySelectorAll('*').forEach(function (el) {
                        var tagName = el.tagName.toLowerCase();
                        // Common content-bearing tags
                        if (['input', 'select', 'textarea', 'img', 'iframe', 'button', 'a', 'p', 'label'].indexOf(tagName) !== -1) {
                            hasContent = true;
                        }
                        // Unique IDs or non-wrapper classes indicate custom gateway elements/containers
                        if (el.id || (el.className && typeof el.className === 'string' && el.className.split(' ').some(function(cls) {
                            return cls && ['payment-method-content', 'content', 'clear'].indexOf(cls) === -1;
                        }))) {
                            hasContent = true;
                        }
                    });
                    if (hasContent) {
                        return true;
                    }

                    // 4. Check if there is any visible text content
                    var text = clone.textContent || clone.innerText || '';
                    if (text.trim().length > 0) {
                        return true;
                    }

                    return false;
                }

                function updateActiveRendererClass(methodCode, activeCode) {
                    
                    var root = document.getElementById('fastcheckout-ko-payment-root'),
                        activeElement = null,
                        movedToTarget = false;

                    // Always hide all target placeholders first
                    hidePaymentPlaceholders();

                    if (!root) {
                        
                        return false;
                    }

                    var allRenderers = document.querySelectorAll('.payment-method');
                    

                    allRenderers.forEach(function (element) {
                        element.classList.remove('_active');
                        element.removeAttribute('data-fastcheckout-active');
                    });

                    allRenderers.forEach(function (element) {
                        if (!activeElement && elementMatchesMethod(element, methodCode, activeCode)) {
                            activeElement = element;
                        }
                    });

                    if (activeElement) {
                        
                        activeElement.classList.add('_active');
                        activeElement.setAttribute('data-fastcheckout-active', 'true');

                        var target = document.querySelector('[data-fastcheckout-payment-method-ko-target="' + methodCode + '"]');
                        if (target) {
                            var shadow = target.shadowRoot;
                            if (!shadow) {
                                shadow = target.attachShadow({ mode: 'open' });
                                
                                // Clone ALL page stylesheets (including main Tailwind stylesheet)
                                document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
                                    shadow.appendChild(link.cloneNode(true));
                                });

                                var style = document.createElement('style');
                                style.textContent = `
                                    .payment-method {
                                        display: block !important;
                                        border: none !important;
                                        background: transparent !important;
                                        margin-top: 0 !important;
                                        padding: 0 !important;
                                    }
                                    .payment-method-title,
                                    .actions-toolbar,
                                    .payment-method-billing-address,
                                    .fastcheckout-payment-method-ko-container .payment-method-title,
                                    .fastcheckout-payment-method-ko-container .actions-toolbar,
                                    .fastcheckout-payment-method-ko-container .payment-method-billing-address {
                                        display: none !important;
                                    }
                                    .required-captcha.checkbox {
                                        position: absolute !important;
                                        display: block !important;
                                        visibility: visible !important;
                                        overflow: hidden !important;
                                        opacity: 0 !important;
                                        width: 1px !important;
                                        height: 1px !important;
                                        padding: 0 !important;
                                        border: none !important;
                                    }
                                    .recaptcha-checkout-place-order .field {
                                        margin: 0 !important;
                                        padding: 0 !important;
                                        height: 0 !important;
                                        overflow: hidden !important;
                                    }
                                `;
                                shadow.appendChild(style);
                            }

                            // Wrap activeElement in a container with class fastcheckout-payment-method-ko-container
                            // to ensure that CSS selectors starting with .fastcheckout-payment-method-ko-container will match perfectly!
                            var wrapper = document.createElement('div');
                            wrapper.className = 'fastcheckout-payment-method-ko-container';
                            wrapper.appendChild(activeElement);

                            shadow.appendChild(wrapper);
                            target.classList.remove('hidden');
                            target.style.display = 'block';
                            movedToTarget = true;
                        } else {
                            
                        }
                    } else {
                        
                    }

                    return movedToTarget;
                }

                function applySelectedMethod(methodCode) {
                    
                    var method,
                        renderer,
                        component,
                        activeCode,
                        activeMethod;

                    if (!methodCode) {
                        return false;
                    }

                    component = getRendererComponentForMethod(methodCode);
                    if (component && !loadedRendererComponents[component]) {
                        loadRendererForMethod(methodCode).done(function () {
                            if (getSelectedMethodCode() === methodCode || pendingSelectedMethodCode === methodCode) {
                                retryPendingSelectedMethod();
                            }
                        });
                    }

                    method = getMethod(methodCode) || { method: methodCode };
                    runPatchRenderers();
                    renderer = getRendererByMethod(methodCode);
                    patchRenderer(renderer);
                    activeCode = getRendererCode(renderer, methodCode);
                    
                    activeMethod = getMethod(activeCode) || { method: activeCode, title: method.title };
                    if (renderer && typeof renderer.selectPaymentMethod === 'function') {
                        renderer.selectPaymentMethod();
                    } else {
                        selectPaymentMethodAction(activeMethod);
                        persistPaymentMethodToCheckoutData(activeCode);
                    }
                    return updateActiveRendererClass(methodCode, activeCode);
                }

                var readyDispatched = false;
                var pendingSelectedMethodCode = '';
                var paymentRendererObserver = null;
                var paymentRendererObserverRetryTimer = null;
                var lastSetSelectedMethodCode = '';
                var lastSetSelectedMethodAt = 0;

                function dispatchReadyEvent() {
                    if (readyDispatched) { return; }
                    readyDispatched = true;
                    document.dispatchEvent(new CustomEvent('fastcheckout:ready'));
                }

                function retryPendingSelectedMethod() {
                    if (!pendingSelectedMethodCode || !domHasPaymentMethod(pendingSelectedMethodCode)) {
                        return;
                    }

                    runPatchRenderers();
                    if (applySelectedMethod(pendingSelectedMethodCode)) {
                        pendingSelectedMethodCode = '';
                    }
                }

                function observePaymentRendererRoot() {
                    var root = document.getElementById('fastcheckout-ko-payment-root');

                    if (paymentRendererObserver || !root || typeof window.MutationObserver !== 'function') {
                        return;
                    }

                    paymentRendererObserver = new MutationObserver(function () {
                        if (paymentRendererObserverRetryTimer) {
                            return;
                        }
                        paymentRendererObserverRetryTimer = window.setTimeout(function () {
                            paymentRendererObserverRetryTimer = null;
                            retryPendingSelectedMethod();
                        }, 50);
                    });
                    paymentRendererObserver.observe(root, {
                        childList: true,
                        subtree: true
                    });
                }

                function setSelectedMethod(methodCode) {
                    if (methodCode && methodCode === lastSetSelectedMethodCode && Date.now() - lastSetSelectedMethodAt < 250) {
                        return;
                    }
                    lastSetSelectedMethodCode = methodCode || '';
                    lastSetSelectedMethodAt = Date.now();
                    syncPaymentMethods();

                    if (!methodCode) {
                        pendingSelectedMethodCode = '';
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                        return;
                    }

                    if (
                        getQuotePaymentMethodCode() === methodCode &&
                        lastMagewirePaymentMethodCode === methodCode &&
                        !magewirePaymentMethodSyncTimer
                    ) {
                        pendingSelectedMethodCode = '';
                        runPatchRenderers();
                        updateActiveRendererClass(methodCode, methodCode);
                        return;
                    }

                    if (!domHasPaymentMethod(methodCode)) {
                        pendingSelectedMethodCode = '';
                        persistPaymentMethodToCheckoutData(null);
                        hidePaymentPlaceholders();
                        
                        return;
                    }

                    pendingSelectedMethodCode = methodCode;
                    if (applySelectedMethod(methodCode)) {
                        pendingSelectedMethodCode = '';
                    }

                    [50, 150, 350, 750, 1500, 2500].forEach(function (delay) {
                        window.setTimeout(function () {
                            if (pendingSelectedMethodCode === methodCode) {
                                retryPendingSelectedMethod();
                            }
                        }, delay);
                    });

                    // Signal the page overlay that KO renderers are fully initialized
                    window.setTimeout(dispatchReadyEvent, 850);
                }


                function getActiveRenderer() {
                    var selectedMethod = getSelectedMethodCode(),
                        found = null;

                    registry.get(function (component) {
                        if (found || !component || !component.item || !component.item.method) {
                            return;
                        }

                        if (
                            typeof component.getData === 'function' &&
                            (component.item.method === selectedMethod ||
                                (typeof component.getCode === 'function' && component.getCode() === selectedMethod))
                        ) {
                            found = component;
                        }
                    });

                    return found;
                }

                function assignCheckoutAgreementsFallback(paymentData) {
                    var agreementIds = [];

                    if (
                        !paymentData ||
                        !window.checkoutConfig ||
                        !window.checkoutConfig.checkoutAgreements ||
                        !window.checkoutConfig.checkoutAgreements.isEnabled
                    ) {
                        return paymentData;
                    }

                    $('.payment-method._active div[data-role=checkout-agreements] input').serializeArray().forEach(function (item) {
                        agreementIds.push(item.value);
                    });

                    if (!agreementIds.length) {
                        return paymentData;
                    }

                    paymentData.extension_attributes = paymentData.extension_attributes || {};
                    if (!paymentData.extension_attributes.agreement_ids) {
                        paymentData.extension_attributes.agreement_ids = agreementIds;
                    }

                    return paymentData;
                }

                function validateCheckoutAgreementsFallback(hideError) {
                    var inputs,
                        isValid = true,
                        firstInvalid = null;

                    if (
                        !window.checkoutConfig ||
                        !window.checkoutConfig.checkoutAgreements ||
                        !window.checkoutConfig.checkoutAgreements.isEnabled
                    ) {
                        return true;
                    }

                    inputs = $('.payment-method._active div.checkout-agreements input');
                    if (!inputs.length) {
                        return true;
                    }

                    inputs.each(function (index, element) {
                        var valid = true;

                        if ($.validator && typeof $.validator.validateSingleElement === 'function') {
                            valid = $.validator.validateSingleElement(element, {
                                errorElement: 'div',
                                hideError: !!hideError
                            });
                        } else if ((element.type === 'checkbox' || element.type === 'radio') && !element.checked) {
                            valid = false;
                        }

                        if (!valid) {
                            isValid = false;
                            if (!firstInvalid) {
                                firstInvalid = element;
                            }
                        }
                    });

                    if (!isValid && firstInvalid && !hideError) {
                        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }

                    return isValid;
                }

                function applyPaymentDataAssigners(paymentData) {
                    paymentData = paymentData || { method: getSelectedMethodCode() };

                    loadPaymentValidationComponents();
                    loadOptionalValidationComponents();

                    optionalPaymentDataAssigners.forEach(function (assigner) {
                        try {
                            assigner(paymentData);
                        } catch (e) {
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn('Kkkonrad Fastcheckout: payment data assigner failed.', e);
                            }
                        }
                    });

                    return assignCheckoutAgreementsFallback(paymentData);
                }

                function validateAdditionalValidators(hideError) {
                    loadPaymentValidationComponents();
                    loadOptionalValidationComponents();

                    var isValid = true;

                    if (!additionalValidators || typeof additionalValidators.validate !== 'function') {
                        return validateCheckoutAgreementsFallback(hideError);
                    }

                    try {
                        isValid = additionalValidators.validate(!!hideError);
                    } catch (e) {
                        if (window.console && typeof window.console.warn === 'function') {
                            window.console.warn('Kkkonrad Fastcheckout: additional checkout validation failed.', e);
                        }
                        return false;
                    }

                    return isValid && validateCheckoutAgreementsFallback(hideError);
                }

                loadOptionalValidationComponents();
                loadPaymentValidationComponents();

                function clonePaymentPayload(paymentData) {
                    if (!paymentData || typeof paymentData !== 'object') {
                        return paymentData || {};
                    }

                    return $.extend(true, {}, paymentData);
                }

                function runPlaceOrderRequestModifiers(paymentData, includeBillingAddress, clonePaymentData) {
                    paymentData = clonePaymentData ? clonePaymentPayload(paymentData) : (paymentData || {});

                    var headers = {},
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

                function buildPlaceOrderSyncPayload(paymentData) {
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

                function runPlaceOrderAfterRequestListeners() {
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

                function sanitizeHookPayload(value, depth) {
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
                            return sanitizeHookPayload(item, depth + 1);
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
                        result[key] = sanitizeHookPayload(value[key], depth + 1);
                    });

                    return result;
                }

                function syncPlaceOrderHookData(wire, hookData, deferUpdate) {
                    if (!wire || typeof wire.set !== 'function') {
                        return Promise.resolve();
                    }

                    hookData = hookData || { headers: {}, payload: {} };

                    return Promise.resolve(wire.set('placeOrderRequestHeaders', sanitizeHookPayload(hookData.headers || {}), deferUpdate === true))
                        .then(function () {
                            return wire.set('placeOrderRequestData', sanitizeHookPayload(hookData.payload || {}), deferUpdate === true);
                        });
                }

                window.fastcheckoutHyvaPayment = $.extend(window.fastcheckoutHyvaPayment || {}, {
	                    getActivePaymentData: function () {
	                        var component = getActiveRenderer();

	                        if (component && typeof component.getData === 'function') {
	                            return applyPaymentDataAssigners(component.getData());
                        }

                        return applyPaymentDataAssigners({
                            method: getSelectedMethodCode(),
	                            additional_data: {}
	                        });
	                    },

	                    cleanupKoOrderState: function () {
	                        if (this.koOrderTimeout) {
	                            window.clearTimeout(this.koOrderTimeout);
	                        }
	                        this.koOrderTimeout = null;
	                        this.koOrderDeferred = null;
	                        this.koOrderActive = false;
	                        this.syncWire = null;
	                        this.syncResolve = null;
	                        this.syncReject = null;
	                    },

	                    getPurchaseOrderNumber: function (paymentData) {
	                        var poNumber = '';

	                        if (paymentData) {
	                            poNumber = paymentData.po_number || '';
	                            if (!poNumber && paymentData.additional_data) {
	                                poNumber = paymentData.additional_data.po_number || '';
	                            }
	                        }

	                        if (!poNumber) {
	                            var poInput = document.querySelector('input[name="payment[po_number]"], #po_number');
	                            if (poInput) {
	                                poNumber = poInput.value || '';
	                            }
	                        }

	                        return poNumber;
	                    },

	                    getPaymentAdditionalData: function (paymentData) {
	                        var additionalData = {};

	                        if (paymentData && paymentData.additional_data && typeof paymentData.additional_data === 'object') {
	                            $.extend(additionalData, paymentData.additional_data);
	                        }

	                        if ((paymentData && paymentData.method === 'purchaseorder') || getSelectedMethodCode() === 'purchaseorder') {
	                            additionalData.po_number = this.getPurchaseOrderNumber(paymentData);
	                        }

	                        return additionalData;
	                    },

	                    syncWirePaymentData: function (wire, paymentData, hookData) {
                            paymentData = applyPaymentDataAssigners(
                                (hookData && hookData.paymentData) || paymentData || this.getActivePaymentData()
                            );
                            hookData = hookData || buildPlaceOrderSyncPayload(paymentData);

	                        var additionalData = this.getPaymentAdditionalData(paymentData),
                                extensionAttributes = paymentData && paymentData.extension_attributes ? paymentData.extension_attributes : {},
	                            methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode(),
	                            poNumber = methodCode === 'purchaseorder' ? this.getPurchaseOrderNumber(paymentData) : '';

	                        return Promise.resolve(wire.set('paymentAdditionalData', additionalData, true))
                                .then(function () {
                                    if (typeof wire.set === 'function') {
                                        return wire.set('paymentExtensionAttributes', extensionAttributes, true);
                                    }
                                    return true;
                                })
	                            .then(function () {
	                                if (poNumber && typeof wire.set === 'function') {
	                                    return wire.set('poNumber', poNumber, true);
	                                }
	                                return true;
	                            })
                                .then(function () {
                                    if (hookData) {
                                        return syncPlaceOrderHookData(wire, hookData, true);
                                    }

                                    return true;
	                            });
	                    },

	                    syncPaymentData: function (wire) {
                            var paymentData;

	                        if (!wire || typeof wire.set !== 'function') {
	                            return Promise.resolve();
	                        }

                            paymentData = this.getActivePaymentData();

	                        return this.syncWirePaymentData(
                                wire,
                                paymentData,
                                runPlaceOrderRequestModifiers(paymentData, true)
                            );
	                    },

                        onSelectPaymentMethodAction: function (paymentMethod) {
                            var methodCode = getPaymentMethodCode(paymentMethod),
                                input;

                            if (!methodCode) {
                                persistPaymentMethodToCheckoutData(null);
                                syncPaymentMethodToMagewire(null);
                                hidePaymentPlaceholders();
                                return;
                            }

                            persistPaymentMethodToCheckoutData(methodCode);
                            document.querySelectorAll('input[name="payment_method"]').forEach(function (element) {
                                if (!input && element.value === methodCode) {
                                    input = element;
                                }
                            });
                            if (input && !input.checked) {
                                input.checked = true;
                            }
                            if (domHasPaymentMethod(methodCode)) {
                                loadRendererForMethod(methodCode).done(function () {
                                    runPatchRenderers();
                                    updateActiveRendererClass(methodCode, methodCode);
                                });
                            }
                            syncPaymentMethodToMagewire(paymentMethod);
                        },

                        onSetBillingAddressAction: function (messageContainer, originalAction) {
                            var wire = getMagewireComponent(),
                                billingAddress = quote && typeof quote.billingAddress === 'function' ? quote.billingAddress() : null;

                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();

                            if (!wire) {
                                return originalAction(messageContainer);
                            }

                            return resolveAsKoDeferred(
                                new Promise(function (resolve, reject) {
                                    try {
                                        Promise.resolve(
                                            typeof window.fastcheckoutApplyPendingCheckoutData === 'function'
                                                ? window.fastcheckoutApplyPendingCheckoutData(wire)
                                                : true
                                        )
                                            .then(function () {
                                                syncCheckoutStateWithoutServer(wire);
                                                return writeKoAddressToMagewire(billingAddress, true);
                                            })
                                            .then(function () {
                                                return originalAction(messageContainer);
                                            })
                                            .then(function (result) {
                                                syncQuoteTotalsFromDom();
                                                resolve(result);
                                            })
                                            .catch(function (error) {
                                                reject(error);
                                            });
                                    } catch (error) {
                                        reject(error);
                                    }
                                }),
                                messageContainer
                            );
                        },

                        onSetPaymentInformationAction: function (messageContainer, paymentData, skipBilling, originalAction) {
                            var wire = getMagewireComponent(),
                                self = this,
                                methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode();

                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();

                            if (!wire) {
                                return originalAction(messageContainer, paymentData, skipBilling);
                            }

                            return resolveAsKoDeferred(
                                new Promise(function (resolve, reject) {
                                    try {
                                        if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                                            checkoutTotals.isLoading(true);
                                        }
                                        Promise.resolve(
                                            typeof window.fastcheckoutApplyPendingCheckoutData === 'function'
                                                ? window.fastcheckoutApplyPendingCheckoutData(wire)
                                                : true
                                        )
                                            .then(function () {
                                                syncCheckoutStateWithoutServer(wire);
                                                return self.syncWirePaymentData(wire, paymentData || self.getActivePaymentData());
                                            })
                                            .then(function () {
                                                var currentMagewireMethod = getProperty(wire, 'paymentMethod');
                                                if (methodCode && methodCode !== currentMagewireMethod && methodCode !== lastMagewirePaymentMethodCode && typeof wire.call === 'function') {
                                                    lastMagewirePaymentMethodCode = methodCode;
                                                    return wire.call('selectPaymentMethod', methodCode);
                                                }
                                                return true;
                                            })
                                            .then(function () {
                                                return refreshCheckoutStateFromMagewire();
                                            })
                                            .then(function () {
                                                resolve(true);
                                            })
                                            .catch(function (error) {
                                                reject(error);
                                            });
                                    } catch (error) {
                                        reject(error);
                                    }
                                }),
                                messageContainer
                            );
                        },

                        onGetPaymentInformationAction: function (deferred, messageContainer, originalAction) {
                            if (!getMagewireComponent()) {
                                return originalAction(deferred, messageContainer);
                            }

                            return resolveCheckoutStateRefresh([], deferred, messageContainer);
                        },

                        onGetTotalsAction: function (callbacks, deferred, originalAction) {
                            if (!getMagewireComponent()) {
                                return originalAction(callbacks, deferred);
                            }

                            return resolveCheckoutStateRefresh(callbacks, deferred, getBridgeMessageContainer());
                        },

	                    placeOrder: function (wire, selectedMethod) {
	                        var component,
	                            paymentData,
	                            result,
	                            self = this;

                            clearPaymentMessages();

	                        if (!wire || typeof wire.call !== 'function') {
                                var missingSessionError = new Error(translateFastcheckoutMessage('Checkout session is not ready. Please refresh the page and try again.'));
                                handlePaymentError(missingSessionError, getBridgeMessageContainer());
	                            return Promise.reject(missingSessionError);
	                        }

	                        if (selectedMethod) {
	                            setSelectedMethod(selectedMethod);
	                        }

	                        return ensureRendererForMethod(selectedMethod || getSelectedMethodCode()).then(function () {
                                return prepareCheckoutState(wire);
                            }).then(function () {
	                            component = getActiveRenderer();
	                            paymentData = component && typeof component.getData === 'function'
	                                ? applyPaymentDataAssigners(component.getData())
	                                : this.getActivePaymentData();

	                            if (!component || typeof component.placeOrder !== 'function') {
                                    if (!this.validate()) {
                                        var validationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
                                        handlePaymentError(validationError, getBridgeMessageContainer());
                                        return Promise.reject(validationError);
                                    }
	                                return this.syncPaymentData(wire).then(function () {
	                                    return wire.call('placeOrder', selectedMethod || (paymentData && paymentData.method) || getSelectedMethodCode());
	                                }).then(function (result) {
                                        runPlaceOrderAfterRequestListeners();
                                        return result;
	                                }).catch(function (err) {
                                        runPlaceOrderAfterRequestListeners();
                                        handlePaymentError(err, getBridgeMessageContainer());
                                        throw err;
	                                });
	                            }

	                            if (!this.validate()) {
                                    var activeValidationError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
                                    handlePaymentError(activeValidationError, component.messageContainer || getBridgeMessageContainer());
	                                return Promise.reject(activeValidationError);
	                            }
	                            if (
	                                typeof component.isPlaceOrderActionAllowed === 'function' &&
	                                !component.isPlaceOrderActionAllowed()
	                            ) {
                                    var notReadyError = new Error(translateFastcheckoutMessage('The selected payment method is not ready. Please try again.'));
                                    handlePaymentError(notReadyError, component.messageContainer || getBridgeMessageContainer());
	                                return Promise.reject(notReadyError);
	                            }

	                            this.cleanupKoOrderState();
	                            this.syncWire = wire;
	                            this.koOrderActive = true;
	                            this.koOrderDeferred = $.Deferred();

	                            return new Promise(function (resolve, reject) {
	                                self.syncResolve = resolve;
	                                self.syncReject = reject;
	                                self.koOrderTimeout = window.setTimeout(function () {
	                                    if (!self.koOrderActive) {
	                                        return;
	                                    }
	                                    self.cleanupKoOrderState();
                                        var timeoutError = new Error(translateFastcheckoutMessage('The selected payment method did not start order placement. Please try again.'));
                                        handlePaymentError(timeoutError, component.messageContainer || getBridgeMessageContainer());
	                                    reject(timeoutError);
	                                }, 30000);

	                                try {
	                                    if (component.getCode && component.getCode() === 'braintree') {
	                                        result = component.placeOrder();
	                                    } else {
	                                        result = component.placeOrder(paymentData, new Event('submit'));
	                                    }

	                                    if (result === false) {
	                                        self.cleanupKoOrderState();
                                            var resultError = new Error(translateFastcheckoutMessage('Please check the selected payment method and try again.'));
                                            handlePaymentError(resultError, component.messageContainer || getBridgeMessageContainer());
	                                        reject(resultError);
	                                    }
	                                } catch (e) {
	                                    if (window.console && typeof window.console.error === 'function') {
	                                        window.console.error('Kkkonrad Fastcheckout: component placeOrder thrown exception:', e);
	                                    }
	                                    self.cleanupKoOrderState();
                                        handlePaymentError(e, component.messageContainer || getBridgeMessageContainer());
	                                    reject(e);
	                                }
	                            });
	                        }.bind(this));
	                    },

	                    onPlaceOrderAction: function (paymentData, messageContainer, originalAction) {
	                        var methodCode = paymentData && paymentData.method ? paymentData.method : getSelectedMethodCode();
                            messageContainer = subscribePaymentMessageContainer(messageContainer) || getBridgeMessageContainer();
                            clearPaymentMessages();

	                        if (this.koOrderActive && this.syncWire) {
	                            try {
	                                if (this.koOrderTimeout) {
	                                    window.clearTimeout(this.koOrderTimeout);
	                                    this.koOrderTimeout = null;
	                                }

	                                this.syncWirePaymentData(
                                        this.syncWire,
                                        paymentData,
                                        runPlaceOrderRequestModifiers(paymentData, true, true)
                                    )
	                                    .then(function () {
                                            if (methodCode && typeof this.syncWire.call === 'function') {
                                                return this.syncWire.call('selectPaymentMethod', methodCode);
                                            }

                                            return true;
	                                    }.bind(this))
                                        .then(function () {
                                            return originalAction(paymentData, messageContainer);
                                        })
	                                    .then(function (result) {
                                            if (this.koOrderDeferred && typeof this.koOrderDeferred.resolve === 'function') {
                                                this.koOrderDeferred.resolve(result);
                                            }
	                                        if (this.syncResolve) {
	                                            this.syncResolve(result);
	                                            this.syncResolve = null;
	                                            this.syncReject = null;
	                                        }
                                            this.cleanupKoOrderState();
	                                    }.bind(this))
	                                    .catch(function (err) {
                                            handlePaymentError(err, messageContainer);
	                                        if (this.koOrderDeferred) {
	                                            this.koOrderDeferred.reject(err);
	                                        }
	                                        if (this.syncReject) {
	                                            this.syncReject(err);
	                                        }
	                                        this.cleanupKoOrderState();
	                                    }.bind(this));
	                            } catch (err) {
                                    handlePaymentError(err, messageContainer);
	                                if (this.koOrderDeferred) {
	                                    this.koOrderDeferred.reject(err);
	                                }
	                                if (this.syncReject) {
	                                    this.syncReject(err);
	                                }
	                                this.cleanupKoOrderState();
	                            }

	                            return this.koOrderDeferred ? this.koOrderDeferred.promise() : $.Deferred().promise();
	                        }

                                // Fallback if a gateway calls placeOrderAction outside the Tailwind submit button flow.
                                var wire = this.syncWire || getMagewireComponent(),
                                    fallbackDeferred;

                                if (!wire || typeof wire.call !== 'function') {
                                    return originalAction(paymentData, messageContainer);
                                }

                                this.cleanupKoOrderState();
                                this.syncWire = wire;
                                this.koOrderActive = true;
                                this.koOrderDeferred = $.Deferred();
                                fallbackDeferred = this.koOrderDeferred;
                                this.koOrderTimeout = window.setTimeout(function () {
                                    if (!this.koOrderActive) {
                                        return;
                                    }
                                    var timeoutError = new Error(translateFastcheckoutMessage('The selected payment method did not complete order placement. Please try again.'));
                                    handlePaymentError(timeoutError, messageContainer);
                                    if (fallbackDeferred && typeof fallbackDeferred.reject === 'function') {
                                        fallbackDeferred.reject(timeoutError);
                                    }
                                    this.cleanupKoOrderState();
                                }.bind(this), 30000);

                                this.syncWirePaymentData(
                                    wire,
                                    paymentData,
                                    runPlaceOrderRequestModifiers(paymentData, true, true)
                                )
                                    .then(function () {
                                        if (methodCode && typeof wire.call === 'function') {
                                            return wire.call('selectPaymentMethod', methodCode);
                                        }

                                        return true;
                                    })
                                    .then(function () {
                                        return originalAction(paymentData, messageContainer);
                                    })
                                    .then(function (result) {
                                        if (fallbackDeferred && typeof fallbackDeferred.resolve === 'function') {
                                            fallbackDeferred.resolve(result);
                                        }
                                        this.cleanupKoOrderState();
                                    }.bind(this))
                                    .catch(function (err) {
                                        handlePaymentError(err, messageContainer);
                                        if (fallbackDeferred && typeof fallbackDeferred.reject === 'function') {
                                            fallbackDeferred.reject(err);
                                        }
                                        this.cleanupKoOrderState();
                                    }.bind(this));

                                return fallbackDeferred.promise();
		                    },

	                    handleOrderPlaced: function (detail) {
	                        var deferred = this.koOrderDeferred;

	                        if (detail && detail.redirectUrl) {
	                            this.cleanupKoOrderState();
	                            window.location.replace(detail.redirectUrl);
	                            return true;
	                        }

	                        if (deferred) {
	                            this.cleanupKoOrderState();
	                            deferred.resolve();
	                            return true;
	                        }

	                        return false;
	                    },

                    validate: function () {
                        var component = getActiveRenderer();
                        if (component && typeof component.validate === 'function') {
                            var isValid = component.validate();
                            if (!isValid) {
                                return false;
                            }
                        }
                        return validateAdditionalValidators(false);
                    },

                    afterPlaceOrder: function () {
                        var component = getActiveRenderer();
                        

                        if (component) {
                            // Check if the component has custom post-place order data (like PayU)
                            if (component.postPlaceOrderData) {
                                require(['mage/url', 'jquery'], function (url, $) {
                                    $.getJSON(url.build(component.postPlaceOrderData), function (response) {
                                        if (response.success && response.redirectUri) {
                                            window.location.replace(response.redirectUri);
                                        } else {
                                            window.location.replace(url.build('checkout/onepage/success'));
                                        }
                                    }).fail(function () {
                                        window.location.replace(url.build('checkout/onepage/success'));
                                    });
                                });
                                return;
                            }

                            // If the component overrides standard afterPlaceOrder (like Tpay)
                            if (typeof component.afterPlaceOrder === 'function' && component.redirectAfterPlaceOrder === false) {
                                try {
                                    component.afterPlaceOrder();
                                    return;
                                } catch (e) {
                                    if (window.console && typeof window.console.error === 'function') {
                                        window.console.error('Kkkonrad Fastcheckout: error executing afterPlaceOrder:', e);
                                    }
                                }
                            }
                        }

                        // Default success redirect
                        require(['mage/url'], function (url) {
                            window.location.replace(url.build('checkout/onepage/success'));
                        });
                    },

                    selectPaymentMethod: setSelectedMethod,
                    ensureRendererForMethod: ensureRendererForMethod,
                    getActiveRenderer: getActiveRenderer,
                    getMessageContainer: getBridgeMessageContainer,
                    clearMessages: clearPaymentMessages
                });


                runPatchRenderers();
                observePaymentRendererRoot();
                setSelectedMethod(getSelectedMethodCode());

                document.addEventListener('change', function (event) {
                    if (event.target && event.target.name === 'payment_method') {
                        setSelectedMethod(event.target.value);
                    }
                });

                document.addEventListener('click', function (event) {
                    // Ignore clicks inside the Knockout payment form container to prevent inputs from losing focus
                    if (event.target && event.target.closest('.fastcheckout-payment-method-ko-container')) {
                        return;
                    }

                    var option = event.target ? event.target.closest('[data-fastcheckout-payment-option]') : null,
                        input;

                    if (event.target && event.target.name === 'payment_method') {
                        window.setTimeout(function () {
                            setSelectedMethod(event.target.value);
                        }, 0);
                        return;
                    }

                    if (option) {
                        input = option.querySelector('input[name="payment_method"]');
                        if (input && !input.disabled) {
                            input.checked = true;
                            window.setTimeout(function () {
                                setSelectedMethod(input.value);
                            }, 0);
                        }
                    }
                }, true);

                function moveRenderersBackToRoot() {
                    var root = document.getElementById('fastcheckout-ko-payment-root');
                    
                    hidePaymentPlaceholders();
                    if (root) {
                        var count = 0;
                        document.querySelectorAll('.payment-method').forEach(function (element) {
                            if (element.parentNode !== root) {
                                root.appendChild(element);
                                count++;
                            }
                        });

                        // Clear empty wrappers from shadow roots
                        document.querySelectorAll('[data-fastcheckout-payment-method-ko-target]').forEach(function (placeholder) {
                            if (placeholder.shadowRoot) {
                                placeholder.shadowRoot.querySelectorAll('.fastcheckout-payment-method-ko-container').forEach(function (wrapper) {
                                    wrapper.remove();
                                });
                            }
                        });
                    }
                }

                if (window.Livewire && typeof window.Livewire.hook === 'function') {
                    window.Livewire.hook('element.updating', function (fromEl, toEl) {
                        if (fromEl.getAttribute('wire:key') === 'checkout-payment-methods-card') {
                            var fromCodes = Array.from(fromEl.querySelectorAll('[data-fastcheckout-payment-option]')).map(function (el) {
                                return el.getAttribute('data-fastcheckout-payment-option');
                            }).sort().join(',');

                            var toCodes = Array.from(toEl.querySelectorAll('[data-fastcheckout-payment-option]')).map(function (el) {
                                return el.getAttribute('data-fastcheckout-payment-option');
                            }).sort().join(',');

                            if (fromCodes === toCodes) {
                                
                                return false;
                            }

                            
                            moveRenderersBackToRoot();
                        }
                    });

                    window.Livewire.hook('message.processed', function () {
                        syncPaymentMethods();
                        syncQuoteTotalsFromDom();
                        var code = getSelectedMethodCode();
                        
                        runPatchRenderers();
                        setSelectedMethod(code);

                        var magewireEl = document.querySelector('[wire\\:id]');
                        if (magewireEl && magewireEl.__livewire) {
                            var wire = magewireEl.__livewire;
                            syncAddressToKnockout(wire);
                            var currentMethod = wire.shippingMethod || getProperty(wire, 'shippingMethod');
                            if (currentMethod) {
                                syncSelectedShippingMethodToKnockout(currentMethod);
                            }
                        }
                        syncCheckoutProviderAddressAttributes();
                        if (checkoutTotals && checkoutTotals.isLoading && typeof checkoutTotals.isLoading === 'function') {
                            checkoutTotals.isLoading(false);
                        }
                    });
                }

                // Load discovered layout scripts dynamically via RequireJS
                var layoutScripts = config.layoutScripts || [];
                if (layoutScripts.length > 0) {
                    layoutScripts.forEach(function (scriptModule) {
                        require([scriptModule], function () {
                            
                        }, function (err) {
                            if (window.console && typeof window.console.warn === 'function') {
                                window.console.warn('Kkkonrad Fastcheckout: Could not load layout script:', scriptModule, err);
                            }
                        });
                    });
                }

            });
        });
    };
});
