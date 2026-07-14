var config = {
    map: {
        '*': {
            prototype: 'Kkkonrad_Fastcheckout/js/prototype-safe'
        }
    },
    paths: {
        fastcheckoutLegacyPrototype: 'legacy-build.min'
    },
    shim: {
        fastcheckoutLegacyPrototype: {
            deps: ['jquery'],
            exports: 'Prototype'
        }
    },
    config: {
        mixins: {
            'jquery/bootstrap/collapse': {
                'Kkkonrad_Fastcheckout/js/collapse-jquery-bridge-mixin': true
            }
        }
    }
};
