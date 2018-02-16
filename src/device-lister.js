
import EventEmitter from 'events';
import Usb from 'usb';
import Debug from 'debug';

import { reenumerateUsb, reenumerateSeggerUsb, reenumerateNordicUsb } from './usb-backend';
import reenumerateSerialPort from './serialport-backend';
import reenumerateJlink from './jlink-backend';

const debug = Debug('device-lister:conflater');

export default class DeviceLister extends EventEmitter {
    constructor(capabilities = {}) {
        super();

        debug('Instantiating DeviceLister with capabilities:', capabilities);

        this._currentDevices = new Map();

        this._backends = [];

        const { usb, nordicUsb, seggerUsb, jlink, serialport } = capabilities;

        if (usb) { this._backends.push(reenumerateUsb); }
        if (nordicUsb) { this._backends.push(reenumerateNordicUsb); }
        if (seggerUsb) { this._backends.push(reenumerateSeggerUsb); }
        if (serialport) { this._backends.push(reenumerateSerialPort); }
        if (jlink) { this._backends.push(reenumerateJlink); }

        this._boundReenumerate = this.reenumerate.bind(this);
    }

    start() {
        debug('Attaching event listeners for USB attach/detach');

        Usb.on('attach', this._boundReenumerate);
        Usb.on('detach', this._boundReenumerate);
        this.reenumerate();
    }

    // Stop listening to attach/detach events from USB
    // Needed to let programs exit gracefully
    stop() {
        debug('Removing event listeners for USB attach/detach');

        Usb.removeListener('attach', this._boundReenumerate);
        Usb.removeListener('detach', this._boundReenumerate);
    }

    static get devices() {
        return Object.this._currentDevices;
    }

    reenumerate() {
        // Ask all backends to reenumerate the devices they can see,
        // then (and only then) conflate everything

        debug('Asking all backends to reenumerate');

        const pendings = this._backends.map(backend => backend());

        Promise.all(pendings).then(backendsResult => {
            //             debug('TODO: Should conflate: ', stuff);

            this._conflate(backendsResult);
        }).catch(err => {
            debug('Error after reenumerating: ', err);
            this.emit('error', err);
        });

        return pendings;
    }

    _conflate(backendsResult) {
        debug('All backends have re-enumerated, conflating...');

        const deviceMap = new Map();

        backendsResult.forEach(results => {
            results.forEach(capability => {
                let { serialNumber } = capability;
                if (capability.error) {
                    const capName = Object.keys(capability).filter(key => key !== 'error' && key !== 'serialNumber')[0];
                    debug(capName, 'error', capability.error.message);
                    this.emit('error', capability);
                } else if (!serialNumber) {
                    const capName = Object.keys(capability).filter(key => key !== 'error' && key !== 'serialNumber')[0];
                    debug(capName, 'no serial number');
                    this.emit('noserialnumber', capability);
                } else {
                    // If the serial number is fully numeric (not a hex string),
                    // cast it into an integer
                    if (typeof serialNumber === 'string' && serialNumber.match(/^\d+$/)) {
                        serialNumber = Number(serialNumber);
                    }

                    let device = deviceMap.get(serialNumber) || {};
                    device = Object.assign({}, device, capability);
                    deviceMap.set(serialNumber, device);
                }
            });
        });

        debug('Conflated.');
        this._currentDevices = deviceMap;
        this.emit('conflated', deviceMap);
    }
}
