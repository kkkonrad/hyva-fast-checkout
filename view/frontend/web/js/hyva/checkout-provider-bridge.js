define([
    'jquery',
    'Kkkonrad_Fastcheckout/js/hyva/region-country-guard'
], function ($, regionCountryGuard) {
    'use strict';

    return function (options) {
        var registry = options.registry,
            getPaymentMethods = options.getPaymentMethods || function () { return []; },
            // Never register a temporary fallback over Magento's real checkoutProvider.
            // That was wiping dictionaries.country_id and emptying the country <select>.
            fallbackProvider = null;

        /**
         * Build country option list from Magento sources (best → worst).
         * Must never invent a 0–1 item list used as Magento dictionaries.country_id —
         * select components import that path via setOptions and get stuck empty.
         */
        function getCountryDictionaryOptions() {
            var countryOptions = [],
                seen = {},
                provider,
                existing,
                directory;

            function pushOption(value, label, extra) {
                var key;
                if (value === null || typeof value === 'undefined') {
                    return;
                }
                key = String(value);
                // Keep empty caption option once; skip other empties.
                if (key === '' && seen['']) {
                    return;
                }
                if (key !== '' && seen[key]) {
                    return;
                }
                seen[key] = true;
                countryOptions.push($.extend({
                    value: key,
                    label: label != null && label !== '' ? String(label) : key
                }, extra || {}));
            }

            // 1) Live Magento checkoutProvider dictionaries (authoritative).
            try {
                provider = registry && typeof registry.get === 'function'
                    ? registry.get('checkoutProvider')
                    : null;
                if (provider && typeof provider.get === 'function') {
                    existing = provider.get('dictionaries.country_id') ||
                        (provider.get('dictionaries') && provider.get('dictionaries').country_id);
                    if (Array.isArray(existing) && existing.length > 10) {
                        return existing.slice();
                    }
                }
            } catch (e) {
                // ignore
            }

            // 2) customer-data directory-data (same source Magento directory uses).
            try {
                if (typeof require === 'function' && require.defined &&
                    require.defined('Magento_Customer/js/customer-data')) {
                    directory = require('Magento_Customer/js/customer-data').get('directory-data');
                    directory = typeof directory === 'function' ? directory() : directory;
                    if (directory && typeof directory === 'object') {
                        // Caption
                        pushOption('', ' ');
                        Object.keys(directory).forEach(function (code) {
                            var row = directory[code];
                            if (!code || code === 'data_id') {
                                return;
                            }
                            // directory-data keys are country codes; name may be missing
                            pushOption(
                                code,
                                (row && (row.name || row.label)) || code,
                                row && row.regions ? { is_region_visible: true } : null
                            );
                        });
                        if (countryOptions.length > 10) {
                            return countryOptions;
                        }
                    }
                }
            } catch (e2) {
                countryOptions = [];
                seen = {};
            }

            // 3) DOM scrape only if select already has a full list.
            document.querySelectorAll(
                '.fastcheckout-native-shipping-address select[name="country_id"] option, ' +
                '#shipping select[name="country_id"] option, ' +
                'select[name="country_id"] option'
            ).forEach(function (option) {
                pushOption(option.value, option.textContent ? option.textContent.trim() : option.value);
            });
            if (countryOptions.length > 10) {
                return countryOptions;
            }

            // Incomplete — return empty so callers do NOT write this into Magento.
            return [];
        }

        function getCountryOptionsByValue() {
            var indexedOptions = {};

            getCountryDictionaryOptions().forEach(function (option) {
                if (!option || option.value === '' || option.value === 'delimiter') {
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
                name: 'fastcheckout.checkoutProviderFallback',
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

                    // Refuse incomplete country dictionaries even on the fallback.
                    if (
                        (path === 'dictionaries.country_id' || path === 'dictionaries') &&
                        value
                    ) {
                        if (path === 'dictionaries.country_id' &&
                            Array.isArray(value) && value.length < 10) {
                            return this;
                        }
                        if (path === 'dictionaries' && value.country_id &&
                            Array.isArray(value.country_id) && value.country_id.length < 10) {
                            return this;
                        }
                    }

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

            // Prefer Magento's real checkoutProvider. Only use an isolated fallback
            // for temporary reads — NEVER register it as 'checkoutProvider'.
            if (!provider) {
                if (!fallbackProvider) {
                    fallbackProvider = createCheckoutProviderFallback();
                }
                return fallbackProvider;
            }

            return provider;
        }

        /**
         * Ensure Magento country select keeps a full option list.
         * If a previous restore poisoned dictionaries.country_id, repair it.
         */
        function ensureCountryDictionary(provider) {
            var dictionaries,
                existing,
                countryOptions,
                countryComp;

            provider = provider || getCheckoutProvider();
            if (!provider || typeof provider.get !== 'function') {
                return false;
            }

            dictionaries = provider.get('dictionaries') || {};
            existing = dictionaries.country_id || provider.get('dictionaries.country_id') || [];

            if (Array.isArray(existing) && existing.length > 10) {
                // Still re-push to country component if its options were wiped.
                repairCountryComponentOptions(existing);
                return true;
            }

            countryOptions = getCountryDictionaryOptions();
            if (!countryOptions || countryOptions.length < 10) {
                return false;
            }

            if (typeof provider.set === 'function') {
                // Critical: Magento select imports setOptions from this path.
                provider.set('dictionaries.country_id', countryOptions);
                if (!dictionaries || typeof dictionaries !== 'object') {
                    dictionaries = {};
                }
                dictionaries.country_id = countryOptions;
                provider.set('dictionaries', dictionaries);
            }

            repairCountryComponentOptions(countryOptions);
            return true;
        }

        function repairCountryComponentOptions(countryOptions) {
            if (!registry || !countryOptions || countryOptions.length < 10) {
                return;
            }

            try {
                var countryComp = registry.get(
                    'checkout.steps.shipping-step.shippingAddress.shipping-address-fieldset.country_id'
                );
                if (!countryComp) {
                    return;
                }
                // Keep full source for later filters.
                if (!countryComp.initialOptions || countryComp.initialOptions.length < 10) {
                    countryComp.initialOptions = countryOptions.slice();
                }
                if (typeof countryComp.setOptions === 'function') {
                    var currentLen = typeof countryComp.options === 'function'
                        ? (countryComp.options() || []).length
                        : 0;
                    if (currentLen < 10) {
                        countryComp.setOptions(countryOptions.slice());
                    }
                } else if (typeof countryComp.options === 'function' &&
                    (countryComp.options() || []).length < 10) {
                    countryComp.options(countryOptions.slice());
                }
            } catch (e) {
                // ignore
            }
        }

        function refreshDictionaries(provider) {
            // Only repair/ensure — never shrink Magento's country dictionary.
            ensureCountryDictionary(provider);
        }

        /**
         * Magento UI street lines bind to provider paths like scope.street.0 / .1.
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
                scopePaths = [];

            if (!provider || !addressData) {
                return;
            }

            // Repair country list first so later country_id writes have options.
            ensureCountryDictionary(provider);

            dataToSet = regionCountryGuard.dropRegionFromOtherCountry($.extend(true, {}, addressData));
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
                        if (dataToSet.street) {
                            Object.keys(dataToSet.street).forEach(function (lineKey) {
                                provider.set(scopePath + '.street.' + lineKey, dataToSet.street[lineKey]);
                            });
                        }
                        [
                            'country_id',
                            'countryId',
                            'region_id',
                            'regionId',
                            'region',
                            'city',
                            'postcode',
                            'firstname',
                            'lastname',
                            'telephone',
                            'company'
                        ].forEach(function (field) {
                            if (typeof dataToSet[field] !== 'undefined' && dataToSet[field] !== null && dataToSet[field] !== '') {
                                provider.set(scopePath + '.' + field, dataToSet[field]);
                            }
                        });
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
                [
                    'country_id',
                    'countryId',
                    'region_id',
                    'regionId',
                    'region',
                    'city',
                    'postcode',
                    'firstname',
                    'lastname',
                    'telephone',
                    'company'
                ].forEach(function (field) {
                    if (typeof dataToSet[field] !== 'undefined' && dataToSet[field] !== null && dataToSet[field] !== '') {
                        provider.set('shippingAddress.' + field, dataToSet[field]);
                    }
                });
            } else {
                provider.shippingAddress = dataToSet;
            }
        }

        // Periodically repair if something wiped options (e.g. race during restore).
        if (typeof window !== 'undefined' && !window.fastcheckoutCountryDictRepairScheduled) {
            window.fastcheckoutCountryDictRepairScheduled = true;
            [1000, 2500, 5000, 8000].forEach(function (delay) {
                window.setTimeout(function () {
                    try {
                        ensureCountryDictionary(getCheckoutProvider());
                    } catch (e) {
                        // ignore
                    }
                }, delay);
            });
        }

        return {
            getCountryDictionaryOptions: getCountryDictionaryOptions,
            getCountryOptionsByValue: getCountryOptionsByValue,
            getCheckoutProvider: getCheckoutProvider,
            refreshDictionaries: refreshDictionaries,
            ensureCountryDictionary: ensureCountryDictionary,
            syncAddressData: syncAddressData
        };
    };
});
