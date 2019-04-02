import commonjs from 'rollup-plugin-commonjs';
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
            'usb',
            'serialport',
            'pc-nrfjprog-js',
        ],
        plugins: [
            commonjs({}),
        ],
    },
];
