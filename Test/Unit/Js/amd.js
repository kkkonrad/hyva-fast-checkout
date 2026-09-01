'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function loadAmd(modulePath, dependencies = {}, globals = {}) {
    const filename = path.resolve(
        __dirname,
        '../../../view/frontend/web/js',
        modulePath
    );
    let exported;

    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), Object.assign({
        define(names, factory) {
            if (typeof names === 'function') {
                exported = names();
                return;
            }
            exported = factory(...names.map((name) => {
                if (!Object.hasOwn(dependencies, name)) {
                    throw new Error(`Missing AMD test dependency: ${name}`);
                }
                return dependencies[name];
            }));
        }
    }, globals), {filename});

    return exported;
};
