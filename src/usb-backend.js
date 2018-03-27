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


// Module-wide mutex. Not the most efficient (prevents querying several USB devices
// at once) but should do the trick. TODO: Replace this with a Map of mutexes
// keyed by USB bus / USB address.
const mutex = new Mutex();

// Cache of devices that the backend already knows about. The map has the deviceId
// ("busNr.deviceAddr VID/PID") as key and the following object as value:
// {
//   serialNumber: 1234,
//   manufacturer: 'ACME',
//   product: 'Sprocket adaptor',
//   nordicDfuTrigger: false,
//   device: (instance of usb's Device)
// }
const cachedDevices = new Map();
let isCacheEnabled = false;

const debug = Debug('device-lister:usb');

const SEGGER_VENDOR_ID = 0x1366;
const NORDIC_VENDOR_ID = 0x1915;

/**
 * Perform a control transfer to get a string descriptor from an already
 * open usb device.
 *
 * @param {Object} device The usb device to get the descriptor for.
 * @param {number} index The index to get.
 * @returns {Promise} Promise that resolves with string descriptor.
 */
function getStringDescriptor(device, index) {
    return new Promise((res, rej) => {
        device.getStringDescriptor(index, (err, data) => {
            if (err) {
                rej(err);
            } else {
                res(data);
            }
        });
    });
}

/**
 * Perform control transfers to get multiple string descriptors from an
 * already open usb device. Reading the descriptors in sequence, as
 * parallelizing this will produce random libusb errors.
 *
 * @param {Object} device The usb device to get the descriptors for.
 * @param {Array<number>} indexes The indexes to get.
 * @returns {Promise} Promise that resolves with array of string descriptors.
 */
function getStringDescriptors(device, indexes) {
    return indexes.reduce((prev, index) => (
        prev.then(descriptorValues => (
            getStringDescriptor(device, index)
                .then(descriptorValue => [...descriptorValues, descriptorValue])
        ))
    ), Promise.resolve([]));
}

// Aux function to prettify USB vendor/product IDs
function hexpad4(number) {
    return `0x${number.toString(16).padStart(4, '0')}`;
}

function getDeviceId(device) {
    const { busNumber, deviceAddress } = device;
    const { idVendor, idProduct } = device.deviceDescriptor;
    return `${busNumber}.${deviceAddress} ${hexpad4(idVendor)}/${hexpad4(idProduct)}`;
}


/*
 * Given a filter function, and a trait name, returns a closure over a function that:
 *
 * Given an instance of a USB device, returns *one* structure like:
 * {
 *   error: undefined
 *   serialNumber: 1234,
 *   [traitName]: {
 *     serialNumber: 1234,
 *     manufacturer: 'ACME',
 *     product: 'Sprocket adaptor'
 *     device: (instance of usb's Device),
 *   }
 * }
 *
 * If there was an error fetching information, the serialNumber, manufacturer and
 * product fields will be empty, and the error field will contain the error.
 *
 * If the device didn't pass the `deviceFilter`, the closure function will return
 * undefined instead.
 */
function normalizeUsbDeviceClosure(traitName) {
    return function normalizeUsbDevice(usbDevice) {
        const result = {
            error: undefined,
            serialNumber: undefined,
            [traitName]: {
                serialNumber: undefined,
                manufacturer: undefined,
                product: undefined,
                device: usbDevice,
            },
        };

        const deviceId = getDeviceId(usbDevice);
        const cachedDevice = cachedDevices.get(deviceId);

        if (cachedDevice) {
            debug('Pulling from cache:', deviceId);
            result.serialNumber = cachedDevice.serialNumber;
            result[traitName].serialNumber = cachedDevice.serialNumber;
            result[traitName].manufacturer = cachedDevice.manufacturer;
            result[traitName].product = cachedDevice.product;
            result[traitName].nordicDfuTrigger = cachedDevice.nordicDfuTrigger;
            result[traitName].device = cachedDevice.device;
            return Promise.resolve(result);
        }

        return mutex.use(() => {
            debug('Mutex grabbed.');
            return new Promise((res, rej) => {
                try {
                    usbDevice.open();
                } catch (ex) {
                    return rej(ex);
                }
                return res();
            }).then(() => {
                debug(`Opened: ${deviceId}`);
                return getStringDescriptors(usbDevice, [
                    usbDevice.deviceDescriptor.iSerialNumber,
                    usbDevice.deviceDescriptor.iManufacturer,
                    usbDevice.deviceDescriptor.iProduct,
                ]).then(([serialNumber, manufacturer, product]) => {
                    debug(`Enumerated: ${deviceId} `, [serialNumber, manufacturer, product]);
                    result.serialNumber = serialNumber;
                    result[traitName].serialNumber = serialNumber;
                    result[traitName].manufacturer = manufacturer;
                    result[traitName].product = product;
                    result[traitName].nordicDfuTrigger = usbDevice.interfaces.some(iface => (
                        iface.descriptor.bInterfaceClass === 255 &&
                        iface.descriptor.bInterfaceSubClass === 1 &&
                        iface.descriptor.bInterfaceProtocol === 1
                    ));
                });
            }).catch(ex => {
                debug(`Error! ${deviceId}`, ex.message);
                result.error = ex;
            }).then(() => {
                // Clean up
                try {
                    usbDevice.close();
                } catch (ex) {
                    debug(`Error! ${deviceId}`, ex.message);
                }
                debug('Releasing mutex.');
                if (isCacheEnabled) {
                    debug('Adding to cache:', deviceId);
                    cachedDevices.set(deviceId, result);
                }
                return result;
            });
        });
    };
}

/*
 * Given filters, and a trait name, returns a Promise to a list of objects, like:
 *
 * [{
 *   error: undefined
 *   serialNumber: 1234,
 *   usb: {
 *     serialNumber: 1234,
 *     manufacturer: 'ACME',
 *     product: 'Sprocket adaptor'
 *     device: (instance of usb's Device),
 *   }
 * }]
 *
 * If there was an error fetching information, the serialNumber, manufacturer and
 * product fields will be empty, and the error field will contain the error.
 *
 * In any USB backend, errors are per-device.
 */
function genericReenumerateUsb(traitName, vendorId = null) {
    let usbDevices = Usb.getDeviceList();
    if (vendorId !== null) {
        usbDevices = usbDevices.filter(device => (
            device.deviceDescriptor.idVendor === vendorId
        ));
    }
    return Promise.all(usbDevices
        .map(normalizeUsbDeviceClosure(traitName)))
        .then(items => items.filter(item => item));
}


export function reenumerateUsb() {
    debug('Reenumerating all USB devices...');
    return genericReenumerateUsb('usb');
}


// Like reenumerateUsb, but cares only about USB devices with the Segger VendorId (0x1366)
export function reenumerateSeggerUsb() {
    debug('Reenumerating all Segger USB devices...');
    return genericReenumerateUsb('seggerUsb', SEGGER_VENDOR_ID);
}

// Like reenumerateUsb, but cares only about USB devices with the Nordic VendorId (0x1915)
export function reenumerateNordicUsb() {
    debug('Reenumerating all Nordic USB devices...');
    return genericReenumerateUsb('nordicUsb', NORDIC_VENDOR_ID);
}

export function reenumerateNordicDfuTrigger() {
    debug('Reenumerating all Nordic USB devices with DFU trigger interface...');
    return genericReenumerateUsb('nordicDfu', NORDIC_VENDOR_ID)
        .then(items => items.filter(item => item.nordicDfu.nordicDfuTrigger));
}

function removeCachedDevice(device) {
    const deviceId = getDeviceId(device);
    debug('Removing from cache:', deviceId);
    cachedDevices.delete(deviceId);
}

export function startCache() {
    isCacheEnabled = true;
    Usb.on('detach', removeCachedDevice);
}

export function stopCache() {
    isCacheEnabled = false;
    Usb.removeListener('detach', removeCachedDevice);
    cachedDevices.clear();
}
