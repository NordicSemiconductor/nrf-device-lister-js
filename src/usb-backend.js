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

/*
 * Returns a promise resolved to boolean for a Nordic device
 * indicating presence of DFU trigger interface,
 * otherwise resolves to undefined
 */
function findDFUTriggerInterface(device) {
    if (device.deviceDescriptor.idVendor !== NORDIC_VENDOR_ID) {
        return Promise.resolve(false);
    }
    return new Promise(resolve => {
        const dfuTriggerInterface = device.interfaces.findIndex(iface => (
            iface.descriptor.bInterfaceClass === 255 &&
            iface.descriptor.bInterfaceSubClass === 1 &&
            iface.descriptor.bInterfaceProtocol === 1
        ));
        if (dfuTriggerInterface > -1) {
            debug('found dfu trigger interface', dfuTriggerInterface);
            resolve(true);
        } else {
            resolve(false);
        }
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

/*
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
 */
function normalizeUsbDevice(usbDevice) {
    const result = {
        error: undefined,
        serialNumber: undefined,
        usb: {
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
            debug(`Opened: ${debugIdStr}`);

            return getStringDescriptors(usbDevice, [
                iSerialNumber,
                iManufacturer,
                iProduct,
            ]).then(descriptors => (
                findDFUTriggerInterface(usbDevice)
                    .then(dfuTrigger => descriptors.concat(dfuTrigger))
            ));
        }).then(([serialNumber, manufacturer, product, dfuTrigger]) => {
            debug(`Enumerated: ${debugIdStr} `, [serialNumber, manufacturer, product, dfuTrigger]);
            usbDevice.close();

            result.serialNumber = serialNumber;
            result.usb.serialNumber = serialNumber;
            result.usb.manufacturer = manufacturer;
            result.usb.product = product;
            result.usb.dfuTrigger = dfuTrigger;
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
            .then(() => debug('Releasing mutex.'))
            .then(() => result);
    });
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
 * In the USB backend, errors are per-device.
 *
 */
export function reenumerateUsb() {
    debug('Reenumerating all USB devices...');
    const usbDevices = Usb.getDeviceList();

    return Promise.all(usbDevices.map(normalizeUsbDevice));
}

// Like reenumerateUsb, but cares only about USB devices with the Segger VendorId (0x1366)
export function reenumerateSeggerUsb() {
    debug('Reenumerating all Segger USB devices...');
    const usbDevices = Usb.getDeviceList().filter(device =>
        device.deviceDescriptor.idVendor === SEGGER_VENDOR_ID);

    return Promise.all(usbDevices.map(normalizeUsbDevice));
}

// Like reenumerateUsb, but cares only about USB devices with the Nordic VendorId (0x1915)
export function reenumerateNordicUsb() {
    debug('Reenumerating all Nordic USB devices...');
    const usbDevices = Usb.getDeviceList().filter(device =>
        device.deviceDescriptor.idVendor === NORDIC_VENDOR_ID);

    return Promise.all(usbDevices.map(normalizeUsbDevice));
}
