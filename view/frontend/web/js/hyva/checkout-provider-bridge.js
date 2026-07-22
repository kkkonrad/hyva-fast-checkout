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

        /**
         * Magento UI street lines bind to provider paths like scope.street.0 / .1.
         * An array (`['a']`) does not drive those children reliably; convert to
         * an object map with empty-string defaults for optional lines.
         *
         * @param {*} street
         * @returns {Object}
         */
        function normalizeStreetForUiProvider(street) {
            var streetObject = {},
                i,
                lineCount = 2;

            if (Array.isArray(street)) {
                for (i = 0; i < Math.max(street.length, lineCount); i++) {
                    streetObject[i] = street[i] == null ? '' : String(street[i]);
                }
                return streetObject;
            }

            if (street && typeof street === 'object') {
                Object.keys(street).forEach(function (key) {
                    streetObject[key] = street[key] == null ? '' : String(street[key]);
                });
                if (typeof streetObject[0] === 'undefined' && typeof streetObject['0'] === 'undefined') {
                    streetObject[0] = '';
                }
                if (typeof streetObject[1] === 'undefined' && typeof streetObject['1'] === 'undefined') {
                    streetObject[1] = '';
                }
                return streetObject;
            }

            return {
                0: street == null || street === '' ? '' : String(street),
                1: ''
            };
        }

        function syncAddressData(addressData, type) {
            var provider = getCheckoutProvider(),
                paymentMethods = getPaymentMethods(),
                dataToSet,
                scopePaths = [],
                pathIndex;

            if (!provider || !addressData) {
                return;
            }

            refreshDictionaries(provider);
            dataToSet = $.extend(true, {}, addressData);
            dataToSet.street = normalizeStreetForUiProvider(dataToSet.street);

            if (type === 'billing') {
                if (typeof provider.set === 'function') {
                    scopePaths = ['billingAddress', 'billingAddressshared'];
                    paymentMethods.forEach(function (method) {
                        if (method.method) {
                            scopePaths.push('billingAddress' + method.method);
                        }
                    });

                    scopePaths.forEach(function (scopePath) {
                        provider.set(scopePath, $.extend(true, {}, dataToSet));
                        // Explicit line sets force already-mounted street UI components
                        // to refresh (parent object replace is not always enough).
                        if (dataToSet.street) {
                            Object.keys(dataToSet.street).forEach(function (lineKey) {
                                provider.set(scopePath + '.street.' + lineKey, dataToSet.street[lineKey]);
                            });
                        }
                    });
                }
                return;
            }

            if (typeof provider.set === 'function') {
                provider.set('shippingAddress', dataToSet);
                if (dataToSet.street) {
                    Object.keys(dataToSet.street).forEach(function (lineKey) {
                        provider.set('shippingAddress.street.' + lineKey, dataToSet.street[lineKey]);
                    });
                }
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
