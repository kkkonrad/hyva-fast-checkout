define([
    'jquery',
    'fastcheckoutLegacyPrototype'
], function (jQuery) {
    'use strict';

    // Magento's legacy admin code expects the global "$" to be Prototype.
    // Loading jQuery first makes the ownership deterministic: legacy-build
    // runs afterwards and installs Prototype's selector as window.$.
    jQuery.noConflict();

    return window.Prototype;
});
