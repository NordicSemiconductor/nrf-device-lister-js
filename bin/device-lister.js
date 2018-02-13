#!/usr/bin/env node
'use strict';

const DeviceLister = require('../');
const version = require('../package.json').version;
const args = require('commander');
const debug = require('debug');

args
  .version(version)
  .description('List conflated USB/serialport/jlink devices')
  .option('-u, --usb', 'Include USB devices (those available through libusb)')
  .option('-s, --serialport', 'Include serial ports (including USB CDC ACMs)')
  .option('-j, --jlink', 'Include J-link probes (those available through pc-nrfjprog-js)')
  .option('-w, --watch', 'Keep outputting a list of devices on any changes')
  .option('-d, --debug', 'Enable debug messages')
  .parse(process.argv);

if (args.debug) {
    debug.enable('device-lister:*');
}

const lister = new DeviceLister({
    usb: args.usb,
    serialport: args.serialport,
    jlink: args.jlink,
});

// lister.on('')

// Aux function to prettify USB vendor/product IDs
function hexpad4(number) {
    return '0x' + number.toString(16).padStart(4, '0');
}

lister.on('error', (capability)=>{
    const key = Object.keys(capability).filter(key => key !== 'error' && key !== 'serialNumber')[0];
    if (key === 'usb') {
        const { idVendor, idProduct } = capability.usb.device.deviceDescriptor;
        console.error('usb error when enumerating USB device with VID/PID',
                      hexpad4(idVendor), '/',  hexpad4(idProduct),
                      ':', capability.error.message);
    } else if (key === 'jlink') {
        console.error('jprog/jlink error: ', capability.error);
    } else {
        console.error(key, 'error', capability.error.message);
    }
});
lister.on('noserialnumber', (capability)=>{
    const key = Object.keys(capability).filter(key => key !== 'error' && key !== 'serialNumber')[0];

    if (key === 'serialport' ) {
        console.error('no serial number for serial port', capability.serialport.comName);
    } else {
        console.error('noserialnumber', capability);
    }
});

lister.on('conflated', deviceMap=>{
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
    setTimeout(()=>{
        lister.stop();
    }, 100);
}

