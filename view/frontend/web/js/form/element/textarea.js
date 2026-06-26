define([
    'jquery',
    'Magento_Ui/js/form/element/abstract',
    'iwdOpcHelper'
], function ($, Abstract) {
    'use strict';

    return Abstract.extend({
        defaults: {
            elementTmpl: 'Kkkonrad_Fastcheckout/form/element/textarea'
        },
        textareaAutoSize: function (element) {
            $(element).textareaAutoSize();
        }
    });
});
