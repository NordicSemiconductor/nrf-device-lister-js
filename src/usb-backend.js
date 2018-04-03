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

import Usb from 'usb';
import Debug from 'debug';
import { Mutex } from 'await-semaphore';
import AbstractBackend from './abstract-backend';
import { getStringDescriptors, openDevice, getDeviceId } from './util/usb';

const debug = Debug('device-lister:usb');

// Module-wide mutex. Not the most efficient (prevents querying several USB devices
// at once) but should do the trick. TODO: Replace this with a Map of mutexes
// keyed by USB bus / USB address.
const mutex = new Mutex();

/**
 * Given a device, runs it through the given filters, and returns an array of
 * the matching filter names.
 *
 * @param {Object} device The usb device to apply filters on.
 * @param {Object} filters Object with filter functions, keyed by filter name.
 * @returns {Array<String>} The filter names that returned a match on the device.
 */
function getMatchingDeviceFilters(device, filters) {
    const filterNames = Object.keys(filters);
    return filterNames.map(filterName => {
        if (filters[filterName](device)) {
            return filterName;
        }
        return undefined;
    }).filter(filterName => filterName);
}

/**
 * Backend that enumerates usb devices.
 */
export default class UsbBackend extends AbstractBackend {
    constructor(closedDeviceFilters = {}, openDeviceFilters = {}) {
        super();
        this._closedDeviceFilters = closedDeviceFilters;
        this._openDeviceFilters = openDeviceFilters;
        this._cachedResults = new Map();
        this._boundRemoveCachedResult = this._removeCachedResult.bind(this);
        Usb.on('detach', this._boundRemoveCachedResult);
    }

    _removeCachedResult(device) {
        const deviceId = getDeviceId(device);
        debug('Removing from cache:', deviceId);
        this._cachedResults.delete(deviceId);
    }

    _getResult(device) {
        const deviceId = getDeviceId(device);
        if (this._cachedResults.has(deviceId)) {
            debug('Reading from cache:', deviceId);
            return this._cachedResults.get(deviceId);
        }

        const result = {
            serialNumber: undefined,
            usb: {
                serialNumber: undefined,
                manufacturer: undefined,
                product: undefined,
                device,
            },
            traits: [],
        };

        result.traits = getMatchingDeviceFilters(device, this._closedDeviceFilters);
        if (result.traits.length === 0) {
            debug('No matching filters for device:', deviceId);
            return Promise.resolve();
        }

        return mutex.use(() => {
            debug('Mutex grabbed.');
            return openDevice(device)
                .then(() => {
                    debug(`Opened: ${deviceId}`);
                    return getStringDescriptors(device, [
                        device.deviceDescriptor.iSerialNumber,
                        device.deviceDescriptor.iManufacturer,
                        device.deviceDescriptor.iProduct,
                    ]).then(([serialNumber, manufacturer, product]) => {
                        debug('Enumerated:', deviceId, [serialNumber, manufacturer, product]);
                        result.serialNumber = serialNumber;
                        result.usb.serialNumber = serialNumber;
                        result.usb.manufacturer = manufacturer;
                        result.usb.product = product;

                        const traits = getMatchingDeviceFilters(device, this._openDeviceFilters);
                        result.traits = result.traits.concat(traits);
                    });
                }).catch(error => {
                    debug('Error when reading device:', deviceId, error);
                    this.emit('error', error);
                }).then(() => {
                    // Clean up
                    try {
                        device.close();
                    } catch (error) {
                        debug('Error when closing device:', deviceId, error);
                        this.emit('error', error);
                    }
                    debug('Releasing mutex.');
                    if (result.traits.length === 0) {
                        debug('No matching filters for device:', deviceId);
                        return null;
                    }
                    debug('Adding to cache:', deviceId);
                    this._cachedResults.set(deviceId, result);
                    return result;
                });
        });
    }

    reenumerate() {
        debug('Reenumerating...');
        return Promise.all(Usb.getDeviceList().map(device => this._getResult(device)))
            .then(results => results.filter(result => result));
    }

    close() {
        Usb.removeListener('detach', this._boundRemoveCachedResult);
    }
}
