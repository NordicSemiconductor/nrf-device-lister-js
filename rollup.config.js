import buble from 'rollup-plugin-buble';
import pkg from './package.json';

export default [
    {
        input: pkg.module,
        output: [
            { file: pkg.main, format: 'cjs', sourcemap: true },
            // { file: pkg.module, format: 'es', sourcemap: true }
        ],
        external: [
            'await-semaphore',
            'events',
            'util',
            'debug',
            'nrf-usb',
            'serialport',
            'pc-nrfjprog-js',
        ],
        plugins: [
            buble({}),
        ],
    },
];
