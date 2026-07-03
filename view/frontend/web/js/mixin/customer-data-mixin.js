define([
    'jquery',
    'mage/utils/wrapper',
    'Kkkonrad_Fastcheckout/js/mixin/is-fastcheckout-active'
], function ($, wrapper, isFastcheckoutActive) {
    'use strict';

    return function (customerData) {
        if (!customerData) {
            return customerData;
        }

        var isSyncing = false,
            lastPrivateContent = {};

        function mergeSection(sectionName, sectionData) {
            lastPrivateContent = $.extend(true, {}, lastPrivateContent);
            lastPrivateContent[sectionName] = sectionData;

            return lastPrivateContent;
        }

        function mergeSections(sections) {
            lastPrivateContent = $.extend(true, {}, lastPrivateContent, sections || {});

            return lastPrivateContent;
        }

        function dispatchCustomerDataUpdated(sections) {
            window.dispatchEvent(new CustomEvent('fastcheckout:customer-data-updated', {
                detail: {
                    data: sections || {}
                }
            }));
        }

        function dispatchPrivateContentLoaded(sections) {
            window.dispatchEvent(new CustomEvent('private-content-loaded', {
                detail: {
                    data: mergeSections(sections)
                }
            }));
        }

        window.addEventListener('private-content-loaded', function (event) {
            if (!isFastcheckoutActive() || isSyncing) {
                return;
            }
            var sections = event.detail && event.detail.data;
            if (sections && typeof sections === 'object') {
                mergeSections(sections);
                isSyncing = true;
                try {
                    Object.keys(sections).forEach(function (sectionName) {
                        if (typeof customerData.get === 'function') {
                            var currentData = customerData.get(sectionName)();
                            if (JSON.stringify(currentData) !== JSON.stringify(sections[sectionName])) {
                                if (typeof customerData.set === 'function') {
                                    customerData.set(sectionName, sections[sectionName]);
                                }
                            }
                        }
                    });
                } catch (e) {
                    if (window.console && typeof window.console.warn === 'function') {
                        window.console.warn('Fastcheckout: Syncing customerData from Hyva failed', e);
                    }
                } finally {
                    isSyncing = false;
                }
            }
        });

        if (typeof customerData.set === 'function') {
            customerData.set = wrapper.wrap(customerData.set, function (originalSet, sectionName, sectionData) {
                var isStorageReady = typeof customerData.getInitCustomerData === 'function' &&
                                     customerData.getInitCustomerData().state() === 'resolved';

                if (!isStorageReady) {
                    try {
                        if (window.localStorage) {
                            var cache = JSON.parse(window.localStorage.getItem('mage-cache-storage') || '{}');
                            cache[sectionName] = sectionData;
                            window.localStorage.setItem('mage-cache-storage', JSON.stringify(cache));
                        }
                    } catch (e) {}
                    return;
                }

                var result = originalSet(sectionName, sectionData);

                if (isFastcheckoutActive() && !isSyncing) {
                    var data = {};
                    data[sectionName] = sectionData;

                    mergeSection(sectionName, sectionData);
                    dispatchCustomerDataUpdated(data);
                    dispatchPrivateContentLoaded(data);
                }

                return result;
            });
        }

        if (typeof customerData.invalidate === 'function') {
            customerData.invalidate = wrapper.wrap(customerData.invalidate, function (originalInvalidate, sectionNames) {
                var result = originalInvalidate(sectionNames);

                if (isFastcheckoutActive() && !isSyncing) {
                    window.dispatchEvent(new CustomEvent('reload-customer-section-data'));
                }

                return result;
            });
        }

        if (typeof customerData.reload === 'function') {
            customerData.reload = wrapper.wrap(customerData.reload, function (originalReload, sectionNames, forceNewSectionTimestamp) {
                var deferred = originalReload(sectionNames, forceNewSectionTimestamp);
                
                if (deferred && typeof deferred.done === 'function') {
                    deferred.done(function (sections) {
                        if (isFastcheckoutActive() && !isSyncing && sections && typeof sections === 'object') {
                            dispatchCustomerDataUpdated(sections);
                            dispatchPrivateContentLoaded(sections);
                        }
                    });
                }

                return deferred;
            });
        }

        return customerData;
    };
});
