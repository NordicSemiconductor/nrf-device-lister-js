/* Copyright (c) 2010 - 2018, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY, AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

import EventEmitter from 'events';
import Usb from 'usb';
import Debug from 'debug';
import { inspect } from 'util';

import {
    reenumerateUsb,
    reenumerateSeggerUsb,
    reenumerateNordicUsb,
    reenumerateNordicAndSeggerUsb,
} from './usb-backend';
import reenumerateSerialPort from './serialport-backend';
import reenumerateJlink from './jlink-backend';

const debug = Debug('device-lister:conflater');

export default class DeviceLister extends EventEmitter {
    constructor(traits = {}) {
        super();

        debug('Instantiating DeviceLister with traits:', traits);

        this._currentDevices = new Map();
        this._currentErrors = new Set();

        this._backends = [];

        const {
            usb, nordicUsb, seggerUsb, jlink, serialport,
        } = traits;

        if (usb) {
            this._backends.push(reenumerateUsb);
        } else if (nordicUsb && !seggerUsb) {
            this._backends.push(reenumerateNordicUsb);
        } else if (seggerUsb && !nordicUsb) {
            this._backends.push(reenumerateSeggerUsb);
        } else {
            this._backends.push(reenumerateNordicAndSeggerUsb);
        }
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
        const newErrors = new Set();

        backendsResult.forEach(results => {
            results.forEach(trait => {
                let { serialNumber } = trait;
                if (trait.error || (!serialNumber)) {
                    const hash = inspect(trait, { depth: null });
                    if (!this._currentErrors.has(hash)) {
                        const capName = Object.keys(trait).filter(key => key !== 'error' && key !== 'serialNumber')[0];
                        if (trait.error) {
                            debug(capName, 'error', trait.error.message);
                            this.emit('error', trait);
                        } else {
                            debug(capName, 'no serial number');
                            this.emit('noserialnumber', trait);
                        }
                    }

                    newErrors.add(hash);
                } else {
                    // If the serial number is fully numeric (not a hex string),
                    // cast it into an integer
                    if (typeof serialNumber === 'string' && serialNumber.match(/^\d+$/)) {
                        serialNumber = Number(serialNumber);
                    }

                    let device = deviceMap.get(serialNumber) || {};
                    device = Object.assign({}, device, trait);
                    deviceMap.set(serialNumber, device);
                }
            });
        });

        this._currentErrors = newErrors;

        debug(`Conflated. Now ${Array.from(deviceMap).length} devices with known serial number and ${Array.from(this._currentErrors).length} without.`);
        this._currentDevices = deviceMap;
        this.emit('conflated', deviceMap);
    }
}
