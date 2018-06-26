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
import UsbBackend from './usb-backend';
import SerialPortBackend from './serialport-backend';
import JlinkBackend from './jlink-backend';
import ErrorCodes from './util/errors';

const debug = Debug('device-lister:conflater');

const SEGGER_VENDOR_ID = 0x1366;
const NORDIC_VENDOR_ID = 0x1915;

class DeviceLister extends EventEmitter {
    constructor(traits = {}) {
        super();

        debug('Instantiating DeviceLister with traits:', traits);

        // Caches
        this._currentDevices = new Map();
        this._currentErrors = new Set();

        // State for throttling down reenumerations
        this._activeReenumeration = false; // Promise or false
        this._queuedReenumeration = false; // Boolean


        this._backends = [];

        const {
            usb, nordicUsb, nordicDfu, seggerUsb, jlink, serialport,
        } = traits;

        const usbDeviceClosedFilters = {};
        const usbDeviceOpenFilters = {};
        if (usb) { usbDeviceClosedFilters.usb = () => true; }
        if (nordicUsb) {
            usbDeviceClosedFilters.nordicUsb = device => (
                device.deviceDescriptor.idVendor === NORDIC_VENDOR_ID
            );
        }
        if (seggerUsb) {
            usbDeviceClosedFilters.seggerUsb = device => (
                device.deviceDescriptor.idVendor === SEGGER_VENDOR_ID
            );
        }
        if (nordicDfu) {
            usbDeviceOpenFilters.nordicDfu = device =>
                device.deviceDescriptor.idVendor === NORDIC_VENDOR_ID &&
                device.interfaces.some(iface => (
                    iface.descriptor.bInterfaceClass === 255 &&
                    iface.descriptor.bInterfaceSubClass === 1 &&
                    iface.descriptor.bInterfaceProtocol === 1
                ));
        }

        if (Object.keys(usbDeviceClosedFilters).length > 0 ||
            Object.keys(usbDeviceOpenFilters).length > 0) {
            this._backends.push(new UsbBackend(usbDeviceClosedFilters, usbDeviceOpenFilters));
        }
        if (serialport) { this._backends.push(new SerialPortBackend()); }
        if (jlink) { this._backends.push(new JlinkBackend()); }

        this._boundReenumerate = this._triggerReenumeration.bind(this);
    }

    start() {
        debug('Attaching event listeners for USB attach/detach');

        Usb.on('attach', this._boundReenumerate);
        Usb.on('detach', this._boundReenumerate);

        this._backends.forEach(backend => backend.start());

        this.reenumerate();
    }

    // Stop listening to attach/detach events from USB
    // Needed to let programs exit gracefully
    stop() {
        debug('Removing event listeners for USB attach/detach');

        this._backends.forEach(backend => backend.stop());

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

        const pendings = this._backends.map(backend => backend.reenumerate());

        return Promise.all(pendings)
            .then(backendsResult => this._conflate(backendsResult))
            .catch(err => {
                debug('Error after reenumerating: ', err);
                this.emit('error', err);
            });
    }


    // Called on the USB attach/detach events, throttles down calls to reenumerate()
    // Only one reenumeration will be active at any one time - if any reenumerations
    // are triggered by events when there is one already active, the first one
    // will be queued and delayed until the active one is finished, the rest
    // will be silently ignored.
    _triggerReenumeration(usbDevice) {
        debug(`Called _triggerReenumeration because of added/removed USB device VID/PID 0x${
            usbDevice.deviceDescriptor.idVendor.toString(16).padStart(4, '0')}/0x${
            usbDevice.deviceDescriptor.idProduct.toString(16).padStart(4, '0')}`);

        if (!this._activeReenumeration) {
            debug('Calling reenumerate().');
            this._activeReenumeration = this.reenumerate().then(() => {
                this._activeReenumeration = false;
            });
        } else if (!this._queuedReenumeration) {
            debug('Queuing one reenumeration.');
            this._queuedReenumeration = true;

            this._activeReenumeration.then(() => {
                debug('Previous reenumeration done, triggering queued one.');

                this._activeReenumeration = this.reenumerate().then(() => {
                    this._activeReenumeration = false;
                });
                this._queuedReenumeration = false;
            });
        } else {
            debug('Skipping spurious reenumeration request.');
        }
    }


    _conflate(backendsResult) {
        debug('All backends have re-enumerated, conflating...');

        const deviceMap = new Map();
        const newErrors = new Set();

        backendsResult.forEach(results => {
            results.forEach(result => {
                if (result.serialNumber) {
                    const { serialNumber } = result;

                    let device = deviceMap.get(serialNumber) || {};
                    const { traits } = device;
                    device = Object.assign({}, device, result);
                    if (traits) {
                        device.traits = result.traits.concat(traits);
                    }
                    deviceMap.set(serialNumber, device);
                } else if (result.errorSource) {
                    if (!this._currentErrors.has(result.errorSource)) {
                        this.emit('error', result.error);
                    }
                    newErrors.add(result.errorSource);
                } else {
                    const err = new Error(`Received neither serial number nor error! ${result}`);
                    err.errorCode = ErrorCodes.RECEIVED_NEITHER_SNO_NOR_ERROR;
                    throw err;
                }
            });
        });

        this._currentErrors = newErrors;

        debug(`Conflated. Now ${Array.from(deviceMap).length} devices with known serial number and ${Array.from(this._currentErrors).length} without.`);
        this._currentDevices = deviceMap;
        this.emit('conflated', deviceMap);
        return deviceMap;
    }
}

module.exports = {
    DeviceLister,
    ErrorCodes,
};
