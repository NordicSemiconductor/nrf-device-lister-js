
import buble from 'rollup-plugin-buble';
import pkg from './package.json';

export default [
    {
        input: pkg.module,
        output: [
            { file: pkg.main, format: 'cjs', sourcemap: true },
//             { file: pkg.module, format: 'es', sourcemap: true }
        ],
        external: ['events', 'debug', 'usb', 'serialport', 'pc-nrf-jprog-js'],
        plugins: [
            buble({}),
        ]
    }
];
