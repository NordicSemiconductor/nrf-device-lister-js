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

const debug = Debug('device-lister:usb');

const SEGGER_VENDOR_ID = 0x1366;
const NORDIC_VENDOR_ID = 0x1915;

// Aux shorthand function. Given an instance of Usb's Device (should be open already) and
// a string descriptor index, returns a Promise to a String.
function getStr(device, index) {
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

// Aux function to prettify USB vendor/product IDs
function hexpad4(number) {
    return `0x${number.toString(16).padStart(4, '0')}`;
}


/*
 * Given a filter function, and a trait name, returns a closure over a function that:
 *
 * Given an instance of a USB device, returns *one* structure like:
 * {
 *   error: undefined
 *   serialNumber: 1234,
 *   usb: {
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
function normalizeUsbDeviceClosure(deviceFilter, traitName) {
    return function normalizeUsbDevice(usbDevice) {
        let result = {
            error: undefined,
            serialNumber: undefined,
            [traitName]: {
                serialNumber: undefined,
                manufacturer: undefined,
                product: undefined,
                device: usbDevice,
            },
        };

        const { busNumber, deviceAddress, deviceDescriptor } = usbDevice;
        const {
            iSerialNumber, iManufacturer, iProduct, idVendor, idProduct,
        } = deviceDescriptor;
        const debugIdStr = `${busNumber}.${deviceAddress} ${hexpad4(idVendor)}/${hexpad4(idProduct)}`;

        return new Promise((res, rej) => {
            try {
                usbDevice.open();
            } catch (ex) {
                return rej(ex);
            }
            return res();
        }).then(() => {
            debug(`Opened: ${debugIdStr}`);

            return Promise.all([
                getStr(usbDevice, iSerialNumber),
                getStr(usbDevice, iManufacturer),
                getStr(usbDevice, iProduct),
                deviceFilter(usbDevice),
            ]);
        }).then(([serialNumber, manufacturer, product, filtered]) => {
            debug(`Enumerated: ${debugIdStr} `, [serialNumber, manufacturer, product]);
            usbDevice.close();

            if (filtered) {
                result.serialNumber = serialNumber;
                result[traitName].serialNumber = serialNumber;
                result[traitName].manufacturer = manufacturer;
                result[traitName].product = product;
            } else {
                debug(`Device ${debugIdStr} didn't pass the filter`);
                result = undefined;
            }
            return result;
        }).catch(ex => {
            debug(`Error! ${debugIdStr}`, ex.message);

            result.error = ex;
        })
            .then(() => {
            // Clean up
                try {
                    usbDevice.close();
                } catch (ex) {
                    debug(`Error! ${debugIdStr}`, ex.message);
                }
            })
            .then(() => result);
    };
}

/* Returns a Promise to a list of objects, like:
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
function genericReenumerateUsb(
    closedDeviceFilter = () => true, // Applies to *closed* instances of usb's Device
    openedDeviceFilter = () => true, // Applies to *opened* instances of usb's Device
    traitName = 'usb'
) {
    const usbDevices = Usb.getDeviceList().filter(closedDeviceFilter);
    return Promise.all(usbDevices
        .map(normalizeUsbDeviceClosure(openedDeviceFilter, traitName)))
        .then(items => items.filter(item => item));
}


export function reenumerateUsb() {
    debug('Reenumerating all USB devices...');
    return genericReenumerateUsb(() => true, () => true, 'usb');
}


// Like reenumerateUsb, but cares only about USB devices with the Segger VendorId (0x1366)
function filterSeggerVendorId(device) {
    return device.deviceDescriptor.idVendor === SEGGER_VENDOR_ID;
}
export function reenumerateSeggerUsb() {
    debug('Reenumerating all Segger USB devices...');
    return genericReenumerateUsb(filterSeggerVendorId, () => true, 'usb');
}


// Like reenumerateUsb, but cares only about USB devices with the Nordic VendorId (0x1915)
function filterNordicVendorId(device) {
    return device.deviceDescriptor.idVendor === NORDIC_VENDOR_ID;
}
export function reenumerateNordicUsb() {
    debug('Reenumerating all Nordic USB devices...');
    return genericReenumerateUsb(filterNordicVendorId, () => true, 'usb');
}

// Like reenumerateUsb, but cares only about USB devices with the Nordic VendorId (0x1915)
// and a DFU sidechannel trigger interface
function filterDfuSidechannel(device) {
    return device.interfaces.some(iface => (
        iface.descriptor.bInterfaceClass === 255 &&
            iface.descriptor.bInterfaceSubClass === 1 &&
            iface.descriptor.bInterfaceProtocol === 1
    ));
}
export function reenumerateNordicDfuSidechannel() {
    debug('Reenumerating all Nordic USB devices with DFU sidechannel trigger...');
    return genericReenumerateUsb(filterNordicVendorId, filterDfuSidechannel, 'nordic-dfu-trigger');
}
