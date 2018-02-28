#!/usr/bin/env node

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

/* eslint comma-dangle: ["error", {"objects": "always-multiline", "functions": "ignore"}] */

'use strict';

const DeviceLister = require('../');
const { version } = require('../package.json');
const args = require('commander');
const debug = require('debug');

args
    .version(version)
    .description('List conflated USB/serialport/jlink devices')
    .option('-u, --usb', 'Include USB devices (those available through libusb)')
    .option('-n, --nordic-usb', 'Include Nordic USB devices (with VendorID 0x1915, if available through libusb)')
    .option('-g, --segger-usb', 'Include Segger USB devices (with VendorID 0x1366, if available through libusb)')
    .option('-s, --serialport', 'Include serial ports (including USB CDC ACMs)')
    .option('-j, --jlink', 'Include J-link probes (those available through pc-nrfjprog-js)')
    .option('-w, --watch', 'Keep outputting a list of devices on any changes')
    .option('-d, --debug', 'Enable debug messages')
    .parse(process.argv);

if (args.debug) {
    debug.enable('device-lister:*');
}

if (!args.usb && !args.nordicUsb && !args.seggerUsb && !args.serialport && !args.jlink) {
    console.error('No device capabilties specified, no devices will be listed!');
    console.error('Run with the --help option to see types of devices to watch for.');
}

const lister = new DeviceLister({
    usb: args.usb,
    nordicUsb: args.nordicUsb,
    seggerUsb: args.seggerUsb,
    serialport: args.serialport,
    jlink: args.jlink,
});

// Aux function to prettify USB vendor/product IDs
function hexpad4(number) {
    return `0x${number.toString(16).padStart(4, '0')}`;
}

lister.on('error', capability => {
    const filteredKey = Object.keys(capability).filter(key => key !== 'error' && key !== 'serialNumber')[0];
    if (filteredKey === 'usb') {
        const { idVendor, idProduct } = capability.usb.device.deviceDescriptor;
        console.error(
            'usb error when enumerating USB device with VID/PID',
            hexpad4(idVendor), '/', hexpad4(idProduct),
            ':', capability.error.message
        );
    } else if (filteredKey === 'jlink') {
        console.error('jprog/jlink error: ', capability.error);
    } else {
        console.error(filteredKey, 'error', capability.error.message);
    }
});

lister.on('noserialnumber', capability => {
    const filteredKey = Object.keys(capability).filter(key => key !== 'error' && key !== 'serialNumber')[0];

    if (filteredKey === 'serialport') {
        console.error('no serial number for serial port', capability.serialport.comName);
    } else {
        console.error('noserialnumber', capability);
    }
});

lister.on('conflated', deviceMap => {
    // Pretty-print some info
    console.log('Received update:');
    deviceMap.forEach((device, serialNumber) => {
        const keys = Object.keys(device).filter(key => key !== 'error' && key !== 'serialNumber');
        console.log(serialNumber, keys);
    });
    console.log();
});


lister.start();

if (!args.watch) {
    // Kinda counter-intuitive: the default for the library is to keep running
    // so if *no* --watch parameter has been passed, make it stop.
    setTimeout(() => {
        lister.stop();
    }, 100);
}
