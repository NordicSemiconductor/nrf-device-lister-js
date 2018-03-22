
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
// Each device has information of their (usb, jlink, serialport) traits.
// USB devices have a minimal data structure containing a Device instance,
// as per the 'usb' module. Serial port devices have the metadata structure
// returned by the 'list()' function of the 'serialport' module. J-link probes
// will only have the boolean `true`.
lister.on('conflated', function(deviceMap){
    // Loop through map, etc
    // Each item in the Map will look like this:
    /*
       { error: undefined,
         serialNumber: 12345678,
         usb: { serialNumber: 12345678,
                 manufacturer: "Manufacturer Co",
                 product: "Gizmo",
                 device: (Instance of Device as per 'usb' module) }
         nordicUsb: { serialNumber: 12345678,
                 manufacturer: "Manufacturer Co",
                 product: "Gizmo",
                 device: (Instance of Device as per 'usb' module) }
         seggerUsb: { serialNumber: 12345678,
                 manufacturer: "Manufacturer Co",
                 product: "Gizmo",
                 device: (Instance of Device as per 'usb' module) }
         nordicDfu: { serialNumber: 12345678,
                 manufacturer: "Manufacturer Co",
                 product: "Gizmo",
                 device: (Instance of Device as per 'usb' module) }
         serialport: { manufacturer: "Manufacturer Co",
                       serialNumber: 1234678,
                       pnpId: "some-long-string",
                       locationId: undefined,
                       vendorId: "1234",
                       productId: "5678",
                       comName: "/dev/ttyACM0" },
         jlink: true
    */
});

// The 'error' event fires whenever a serial number could not be
// fetched, or when enumeration failed.
// There are two specific cases where this will happen: no permissions
// to open a USB device through libusb, and some error in pc-nrfjprog-js
// (or the subjacent jlink libraries).
// The recommendation is to raise all errors related to devices with the 'jlink'
// trait, and devices with the 'usb' trait only if their Product ID/Vendor ID
// (as listed in the usb Device) are of interest to your application.
// Errors that happen on consecutive enumerations are throttled down: only
// the first one is emitted.
lister.on('error', function(device){
    // the only parameter is a non-conflated device.
    // It will look like:
    /*
       { error: (Instance of Error),
         serialNumber: undefined,
         usb:  { serialNumber: undefined,
                 manufacturer: undefined,
                 product: undefined,
                 device: (Instance of Device as per 'usb' module) }
       }
    */
    // or like:
    /*
       { error: (Instance of Error),
         serialNumber: undefined,
         jlink: undefined
       }
    */
});


// The 'noserialnumber' event fires whenever a device was correctly enumerated,
// but it reported no serial number. This usually happens with on-board
// serial ports (which are not USB devices and therefore do not report
// any serial numbers)
// 'noserialnumber' events that happen on consecutive enumerations are throttled down: only
// the first one is emitted.
lister.on('noserialnumber', function(device){
    // the only parameter is a non-conflated device.
    // It will look like:
    /*
       { error: (Instance of Error),
         serialNumber: undefined,
         serialport: { manufacturer: undefined,
                       serialNumber: undefined,
                       pnpId: undefined,
                       locationId: undefined,
                       vendorId: undefined,
                       productId: undefined,
                       comName: "/dev/ttyS0" },
    */
});

// Start listening to hardware changes (in connected/disconnected USB devices).
lister.start();


// When all is done (or after some time, etc), stop listening to hardware changes
// (in connected/disconnected USB devices)
setTimeout(function(){ lister.stop(); }, 5000);

```



