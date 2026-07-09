define([
    'jquery'
], function ($) {
    'use strict';

    return function (options) {
        var registry = options.registry,
            getPaymentMethods = options.getPaymentMethods || function () { return []; };

        function getCountryDictionaryOptions() {
            var countryOptions = [];

            document.querySelectorAll('#co-shipping-country-id option, select[name="country_id"] option').forEach(function (option) {
                var value = option.value;

                if (!value && value !== '') {
                    return;
                }

                if (countryOptions.some(function (item) { return item.value === value; })) {
                    return;
                }

                countryOptions.push({
                    value: value,
                    label: option.textContent ? option.textContent.trim() : value
                });
            });

            if (!countryOptions.length && window.checkoutConfig && window.checkoutConfig.defaultCountryId) {
                countryOptions.push({
                    value: window.checkoutConfig.defaultCountryId,
                    label: window.checkoutConfig.defaultCountryId
                });
            }

            return countryOptions;
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

        function refreshDictionaries(provider) {
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

        function syncAddressData(addressData, type) {
            var provider = getCheckoutProvider(),
                paymentMethods = getPaymentMethods(),
                dataToSet;

            if (!provider || !addressData) {
                return;
            }

            refreshDictionaries(provider);
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

        return {
            getCountryDictionaryOptions: getCountryDictionaryOptions,
            getCountryOptionsByValue: getCountryOptionsByValue,
            getCheckoutProvider: getCheckoutProvider,
            refreshDictionaries: refreshDictionaries,
            syncAddressData: syncAddressData
        };
    };
});
