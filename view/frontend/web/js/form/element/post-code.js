define([
    'underscore',
    'uiRegistry',
    'Magento_Ui/js/form/element/abstract'
], function (_, registry, Abstract) {
    'use strict';

    return Abstract.extend({
        defaults: {
            imports: {
                update: '${ $.parentName }.country_id:value'
            }
        },
        initObservable: function () {
            this._super();
            this.observe('placeholder');
            return this;
        },
        /**
         * @param {String} value
         */
        update: function (value) {
            var country = registry.get(this.parentName + '.' + 'country_id'),
                options = country.indexedOptions,
                option;

            if (!value) {
                return;
            }

            option = options[value];
            var placeholder = '';
            if (option && option['is_zipcode_optional']) {
                this.error(false);
                this.validation = _.omit(this.validation, 'required-entry');
                placeholder = this.placeholder().replace('*', '').trim();
            } else {
                this.validation['required-entry'] = true;
                placeholder = this.placeholder().replace('*', '').trim();
                placeholder += '\xa0*';
            }

            this.placeholder(placeholder);
            if (option) {
                this.required(!option['is_zipcode_optional']);
            } else {
                this.required(false);
            }
        }
    });
});
