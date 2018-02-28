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

import { reenumerateUsb, reenumerateSeggerUsb, reenumerateNordicUsb } from './usb-backend';
import reenumerateSerialPort from './serialport-backend';
import reenumerateJlink from './jlink-backend';

const debug = Debug('device-lister:conflater');

// private members also to avoid underscores as suggested by:
// https://medium.com/@davidrhyswhite/private-members-in-es6-db1ccd6128a5

const detachPrv = Symbol('detach');
const conflatePrv = Symbol('conflate');
const currentDevicesPrv = Symbol('currentDevices');
const backendsPrv = Symbol('backends');
const supressedDevicesPrv = Symbol('supressedDevices');

export default class DeviceLister extends EventEmitter {
    constructor(capabilities = {}) {
        super();

        debug('Instantiating DeviceLister with capabilities:', capabilities);

        this[currentDevicesPrv] = new Map();
        this[supressedDevicesPrv] = new Set();

        this[backendsPrv] = [];

        const {
            usb, nordicUsb, seggerUsb, jlink, serialport,
        } = capabilities;

        if (usb) { this[backendsPrv].push(reenumerateUsb); }
        if (nordicUsb) { this[backendsPrv].push(reenumerateNordicUsb); }
        if (seggerUsb) { this[backendsPrv].push(reenumerateSeggerUsb); }
        if (serialport) { this[backendsPrv].push(reenumerateSerialPort); }
        if (jlink) { this[backendsPrv].push(reenumerateJlink); }

        this.reenumerate = this.reenumerate.bind(this);
        this[detachPrv] = this[detachPrv].bind(this);
    }

    start() {
        debug('Attaching event listeners for USB attach/detach');

        Usb.on('attach', this.reenumerate);
        Usb.on('detach', this[detachPrv]);
        this.reenumerate();
    }

    // Stop listening to attach/detach events from USB
    // Needed to let programs exit gracefully
    stop() {
        debug('Removing event listeners for USB attach/detach');

        Usb.removeListener('attach', this.reenumerate);
        Usb.removeListener('detach', this[detachPrv]);
    }

    static get devices() {
        return Object.this[currentDevicesPrv];
    }

    reenumerate() {
        // Ask all backends to reenumerate the devices they can see,
        // then (and only then) conflate everything

        debug('Asking all backends to reenumerate');

        const pendings = this[backendsPrv].map(backend => backend());

        Promise.all(pendings).then(backendsResult => {
            //             debug('TODO: Should conflate: ', stuff);

            this[conflatePrv](backendsResult);
        }).catch(err => {
            debug('Error after reenumerating: ', err);
            this.emit('error', err);
        });

        return pendings;
    }

    [detachPrv](detachedDevice) {
        const addr = `${detachedDevice.busNumber}.${detachedDevice.deviceAddress}`;
        debug('Detached usb device', addr);
        this[supressedDevicesPrv].delete(addr);

        this.reenumerate();
    }

    [conflatePrv](backendsResult) {
        debug('All backends have re-enumerated, conflating...');

        const deviceMap = new Map();

        backendsResult.forEach(results => {
            results.forEach(capability => {
                let { serialNumber } = capability;
                if (capability.error) {
                    if (capability.usb) {
                        const { device } = capability.usb;
                        const addr = `${device.busNumber}.${device.deviceAddress}`;
                        if (this[supressedDevicesPrv].has(addr)) {
                            // this device has already reported errors
                            debug('Usb device', addr, 'has already reported errors, skipping');
                            return;
                        }
                        this[supressedDevicesPrv].add(addr);
                    }
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
        this[currentDevicesPrv] = deviceMap;
        this.emit('conflated', deviceMap);
    }
}
