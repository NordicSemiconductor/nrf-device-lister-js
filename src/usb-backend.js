
import Usb from 'usb';
import Debug from 'debug';

const debug = Debug('device-lister:usb');

// Aux shorthand function. Given an instance of Usb's Device (should be open already) and
// a string descriptor index, returns a Promise to a String.
function getStr(device, index) {
    return new Promise((res, rej) => {
        device.getStringDescriptor(index, (err, data) => {
            if (err) { rej(err); } else { res(data); }
        });
    });
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
        ]);
    }).then(([serialNumber, manufacturer, product]) => {
        debug(`Enumerated: ${debugIdStr} `, [serialNumber, manufacturer, product]);
        usbDevice.close();

        result.serialNumber = serialNumber;
        result.usb.serialNumber = serialNumber;
        result.usb.manufacturer = manufacturer;
        result.usb.product = product;
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
    const usbDevices = Usb.getDeviceList().filter((device)=>
        device.deviceDescriptor.idVendor === 0x1366
    );

    return Promise.all(usbDevices.map(normalizeUsbDevice));
}

// Like reenumerateUsb, but cares only about USB devices with the Nordic VendorId (0x1915)
export function reenumerateNordicUsb() {
    debug('Reenumerating all Nordic USB devices...');
    const usbDevices = Usb.getDeviceList().filter((device)=>
        device.deviceDescriptor.idVendor === 0x1915
    );

    return Promise.all(usbDevices.map(normalizeUsbDevice));
}
