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
    .option('-f, --nordic-dfu', 'Include Nordic USB devices with DFU trigger interface')
    .option('-g, --segger-usb', 'Include Segger USB devices (with VendorID 0x1366, if available through libusb)')
    .option('-s, --serialport', 'Include serial ports (including USB CDC ACMs)')
    .option('-j, --jlink', 'Include J-link probes (those available through pc-nrfjprog-js)')
    .option('-b, --find-by-sn [serialNumber]', 'Find device by serial number')
    .option('-a, --list-all', 'List all detected devices')
    .option('-i, --list-all-info', 'List information of all detected devices')
    .option('-w, --watch', 'Keep outputting a list of devices on any changes')
    .option('-d, --debug', 'Enable debug messages')
    .option('-e, --error', 'Enable error messages')
    .parse(process.argv);

if (args.debug) {
    debug.enable('device-lister:*');
}

if (!args.usb && !args.nordicUsb && !args.nordicDfu && !args.seggerUsb &&
    !args.serialport && !args.jlink && args.error) {
    console.error('No device traits specified, no devices will be listed!');
    console.error('Run with the --help option to see types of devices to watch for.');
}

const lister = new DeviceLister({
    usb: args.usb,
    nordicUsb: args.nordicUsb,
    nordicDfu: args.nordicDfu,
    seggerUsb: args.seggerUsb,
    serialport: args.serialport,
    jlink: args.jlink,
});

lister.on('error', error => {
    if (!args.error) {
        return;
    }
    if (error.usb) {
        console.error(`Error from USB device VID/PID 0x${
            error.usb.deviceDescriptor.idVendor.toString(16).padStart(4, '0')}/0x${
            error.usb.deviceDescriptor.idProduct.toString(16).padStart(4, '0')}: ${
            error.message}`);
    } else if (error.serialport) {
        console.error(`Error from a serial port at ${error.serialport.comName}: `, error.message);
    } else {
        console.error(error);
    }
});

lister.on('conflated', deviceMap => {
    if (!args.debug) {
        return;
    }
    // Pretty-print some info
    console.log('Received update:');
    deviceMap.forEach((device, serialNumber) => {
        console.log(serialNumber, device.traits);
    });
    console.log();
});


if (args.watch) {
    lister.start();
} else {
    lister.reenumerate();
}

if (args.findBySn) {
    lister.reenumerate().then(devices => {
        const device = devices.get(args.findBySn);
        console.log(JSON.stringify(device, null, 2));
    });
}

if (args.listAll) {
    lister.reenumerate().then(devices => {
        const result = [];
        devices.forEach(device => {
            result.push(device);
        });
        console.log(JSON.stringify(result, null, 2));
    });
}

if (args.listAllInfo) {
    lister.reenumerate().then(devices => {
        const result = [];
        devices.forEach(device => {
            result.push({
                serialNumber: device.serialNumber,
                boardVersion: device.boardVersion,
                ...device.serialport,
            });
        });
        console.log(JSON.stringify(result, null, 2));
    });
}
