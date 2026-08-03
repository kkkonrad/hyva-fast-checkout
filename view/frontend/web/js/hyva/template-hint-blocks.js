/**
 * Legacy no-op module.
 *
 * Previously wrapped Przelewy24 / debug blocks in spacing divs; that reordered
 * Magento summary children (totals → itemsBefore → cart_items → itemsAfter).
 * Keep the AMD path so any stale require() does not 404.
 */
define([], function () {
    'use strict';

    return {
        start: function () {},
        wrapAll: function () {}
    };
});
