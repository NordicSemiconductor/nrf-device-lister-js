
# nrf-device-lister

List USB/serialport/jlink devices based on traits and conflate them by serial number

This is part of [Nordic Semiconductor](http://www.nordicsemi.com/)'s javascript tools to
interface with nRF SoCs and development kits.

## Building prerequisites

Node.js 8 or newer

## Usage as a command

Do a `npm install nrf-device-lister` or `yarn add nrf-device-lister`, then run in a console:

`node node_modules/.bin/nrf-device-lister --help`

All options are displayed there.


## Usage as a library


```js
// Import / require
var DeviceLister = require('nrf-device-lister');

// Create an instance, specifying which kind of traits to look for,
// as booleans.
var lister = new DeviceLister({
    usb: true,
    nordicUsb: false,   // Like 'usb', but filters by VendorId
    seggerUsb: false,   // Like 'usb', but filters by VendorId
    nordicDfu: false,   // Like 'nordicUsb', but also looks for the Nordic DFU trigger interface
    serialport: true,
    jlink: true,
});


// When started, the lister will emit three kinds of events:

// The 'conflated' event fires whenever there is a new conflated list of
// devices (i.e. after each reenumeration). This list is an instance of Map,
// with the serial number of each device as the keys.
// Each device has a list of the traits that devices shows.
// USB devices have a minimal data structure containing a Device instance,
// as per the 'usb' module. Serial port devices have the metadata structure
// returned by the 'list()' function of the 'serialport' module. J-link probes
// only have the trait.
lister.on('conflated', function(deviceMap){
    // Loop through map, etc
    // Each item in the Map will look like this:
    /*
       { traits: [ 'jlink', 'serialport', 'usb', 'seggerUsb' ],
         serialNumber: 12345678,
         usb: {
            serialNumber: '00012345678',
            manufacturer: 'SEGGER',
            product: 'J-Link',
            device: (Instance of Device as per 'usb' module) }
         serialport: {
            manufacturer: 'SEGGER',
            serialNumber: '00012345678',
            pnpId: 'usb-SEGGER_J-Link_00012345678-if00',
            locationId: undefined,
            vendorId: '1366',
            productId: '1015',
            comName: '/dev/ttyACM1' }
        }
    */
});

// The 'error' event fires whenever a serial number could not be
// fetched, or when enumeration failed.
// There are some specific cases where this will happen: no permissions
// to open a USB device through libusb, an error in pc-nrfjprog-js
// (or the subjacent jlink libraries), or serial ports without a serial number
// (e.g. those built into the motherboard).
// The recommendation is to raise all errors related to devices with the 'jlink'
// trait, and devices with any USB trait only if their Product ID/Vendor ID
// (as listed in the usb Device) are of interest to your application.
// Errors that happen on consecutive enumerations are throttled down: only
// the first one is emitted.
lister.on('error', function(err){
    // `err` is an instance of Error
    console.error(err.message);

    // Optionally, if the error originated from a USB device, there will
    // be an `usb` property with an instance of `usb`'s `Device`:
    if (err.usb) {
        console.error('Error originated from USB device ' +
            'VID: ' + err.usb.deviceDescriptor.idVendor + ' ' +
            'PID: ' + err.usb.deviceDescriptor.idProduct
        );
    }

    // Optionally, if the error originated from a serial port, there will
    // be an `serialport` property with the serial port metadata:
    if (err.serialport) {
        console.error('Error originated from serial port device at ' +
            err.serialport.comName
        );
    }
});


// Ask for *one* enumeration of devices. Result is a Promise for a map of devices,
// just like the parameter for the handler of the `conflated` event.
// Note that calling reenumerate() will also trigger *one* `conflated` event.
lister.reenumerate().then(function(deviceMap){
    // ...iterate through deviceMap and do something...
});


// Start listening to hardware changes (in connected/disconnected USB devices).
lister.start();


// When all is done (or after some time, etc), stop listening to hardware changes
// (in connected/disconnected USB devices)
setTimeout(function(){ lister.stop(); }, 5000);

```



