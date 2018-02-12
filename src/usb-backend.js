
import Usb from 'usb';
import Debug from 'debug'

const debug = Debug('device-lister:usb');

// Aux shorthand function. Given an instance of Usb's Device (should be open already) and
// a string descriptor index, returns a Promise to a String.
function getStr(device, index) {
    return new Promise((res, rej)=>{
        device.getStringDescriptor(index, (err, data)=>{
            if (err) {rej(err);} else {res(data);}
        })
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
export default function reenumerateUsb() {
    debug('Reenumerating...');
    const usbDevices = Usb.getDeviceList();

    return Promise.all(
        usbDevices.map(usbDevice=>{

            const result = {
                error: undefined,
                serialNumber: undefined,
                usb: {
                    serialNumber: undefined,
                    manufacturer: undefined,
                    product: undefined,
                    device: usbDevice
                }
            };

            return new Promise((res, rej)=>{
                usbDevice.open();
            }).then(()=>Promise.all([
                getStr(usbDevice, usbDevice.deviceDescriptor.iSerialNumber),
                getStr(usbDevice, usbDevice.deviceDescriptor.iManufacturer),
                getStr(usbDevice, usbDevice.deviceDescriptor.iProduct)
            ])).then(([serialNumber, manufacturer, product])=>{
                debug('Enumerated:', usbDevice.busNumber + '.' + usbDevice.deviceAddress, [serialNumber, manufacturer, product]);
                usbDevice.close();

                result.serialNumber = serialNumber;
                result.usb.serialNumber = serialNumber;
                result.usb.manufacturer = manufacturer;
                result.usb.product = product;

            }).catch(ex=>{
                try {
                    // Try to clean up, just in case
                    usbDevice.close();
                } catch(ex2) {}

                debug('Error!', usbDevice.busNumber + '.' + usbDevice.deviceAddress, ex.message);

                result.error = ex;
                return result;
            });

        })
    );
}




