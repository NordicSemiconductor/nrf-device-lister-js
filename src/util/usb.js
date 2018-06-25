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

import Debug from 'debug';

const debug = Debug('device-lister:usb');

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
export function getStringDescriptors(device, indexes) {
    return indexes.reduce((prev, index) => (
        prev.then(descriptorValues => (
            getStringDescriptor(device, index)
                .then(descriptorValue => [...descriptorValues, descriptorValue])
        ))
    ), Promise.resolve([]));
}

/**
 * Open a usb device.
 *
 * @param {Object} device The usb device to open.
 * @returns {Promise} Promise that resolves if successful, rejects if failed.
 */
export function openDevice(device) {
    return new Promise((res, rej) => {
        const tryOpen = (retries = 0) => {
            try {
                device.open();
                res();
            } catch (error) {
                if (process.platform === 'win32' &&
                    retries < 5 &&
                    error.message === 'LIBUSB_ERROR_ACCESS') {
                    // In win platforms, the winUSB driver might allow only one
                    // process to access the USB device, potentially creating
                    // race conditions. Mitigate this with an auto-retry mechanism.
                    debug(`Got LIBUSB_ERROR_ACCESS on win32, retrying (attempt ${retries})...`);
                    const delay = (50 * retries * retries) + (100 * Math.random());
                    setTimeout(() => tryOpen(retries + 1), delay);
                } else {
                    rej(error);
                }
            }
        };
        tryOpen();
    });
}

/**
 * Prefix a given number with 0x and pad with 4 zeroes.
 *
 * @param {Number} number The number to prefix and pad.
 * @returns {string} Prefixed and padded number.
 */
export function hexpad4(number) {
    return `0x${number.toString(16).padStart(4, '0')}`;
}

/**
 * Get a string identifier for the given device. The identifier is on the
 * form "busNumber.deviceAddress vendorId/producId".
 *
 * @param {Object} device The device to get an ID for.
 * @returns {string} String ID for the given device.
 */
export function getDeviceId(device) {
    const { busNumber, deviceAddress } = device;
    const { idVendor, idProduct } = device.deviceDescriptor;
    return `${busNumber}.${deviceAddress} ${hexpad4(idVendor)}/${hexpad4(idProduct)}`;
}
