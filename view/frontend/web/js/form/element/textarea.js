define([
    'jquery',
    'Magento_Ui/js/form/element/abstract',
    'iwdOpcHelper'
], function ($, Abstract) {
    'use strict';

    return Abstract.extend({
        defaults: {
            elementTmpl: 'IWD_Opc/form/element/textarea'
        },
        textareaAutoSize: function (element) {
            $(element).textareaAutoSize();
        }
    });
});
