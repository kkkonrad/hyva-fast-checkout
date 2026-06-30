define([
    'jquery',
    'mage/utils/wrapper'
], function ($, wrapper) {
    'use strict';

    return function (customerData) {
        if (!customerData) {
            return customerData;
        }

        var isSyncing = false;

        // 1. Listen to Hyva's private-content-loaded and synchronize it to KO
        window.addEventListener('private-content-loaded', function (event) {
            if (isSyncing) {
                return;
            }
            var sections = event.detail && event.detail.data;
            if (sections && typeof sections === 'object') {
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

        // 2. Intercept customerData.set from KO to notify Hyva/Alpine
        if (typeof customerData.set === 'function') {
            customerData.set = wrapper.wrap(customerData.set, function (originalSet, sectionName, sectionData) {
                var result = originalSet(sectionName, sectionData);

                if (!isSyncing) {
                    var data = {};
                    data[sectionName] = sectionData;
                    window.dispatchEvent(new CustomEvent('private-content-loaded', {
                        detail: {
                            data: data
                        }
                    }));
                }

                return result;
            });
        }

        // 3. Intercept customerData.invalidate and notify Hyva to reload
        if (typeof customerData.invalidate === 'function') {
            customerData.invalidate = wrapper.wrap(customerData.invalidate, function (originalInvalidate, sectionNames) {
                var result = originalInvalidate(sectionNames);

                if (!isSyncing) {
                    // Trigger Hyva private content reload
                    window.dispatchEvent(new CustomEvent('reload-customer-section-data'));
                }

                return result;
            });
        }

        // 4. Intercept customerData.reload and propagate to Hyva
        if (typeof customerData.reload === 'function') {
            customerData.reload = wrapper.wrap(customerData.reload, function (originalReload, sectionNames, forceNewSectionTimestamp) {
                var deferred = originalReload(sectionNames, forceNewSectionTimestamp);
                
                if (deferred && typeof deferred.done === 'function') {
                    deferred.done(function (sections) {
                        if (!isSyncing && sections && typeof sections === 'object') {
                            window.dispatchEvent(new CustomEvent('private-content-loaded', {
                                detail: {
                                    data: sections
                                }
                            }));
                        }
                    });
                }

                return deferred;
            });
        }

        return customerData;
    };
});
