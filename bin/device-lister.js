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

lister.on('error', (err)=>console.error());


if (!args.watch) {
    // Kinda counter-intuitive: the default for the library is to keep running
    // so if *no* --watch parameter has been passed, make it stop.
    setTimeout(()=>{
        lister.stop();
    }, 100);
}

