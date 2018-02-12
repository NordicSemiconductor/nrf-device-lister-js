
import EventEmitter from 'events';
import Usb from 'usb';
import reenumerateUsb from './usb-backend'
import reenumerateSerialPort from './serialport-backend'
import reenumerateJlink from './jlink-backend'
import Debug from 'debug'

const debug = Debug('device-lister:conflater');

export default class DeviceLister extends EventEmitter {
    constructor(capabilities = {}) {
        super();

        debug('Instantiating DeviceLister with capabilities:', capabilities);

        this._currentDevices = new Map();

        this._backends = [];

        const {usb, jlink, serialport} = capabilities;

        if (usb) { this._backends.push(reenumerateUsb) }
        if (serialport) { this._backends.push(reenumerateSerialPort) }
        if (jlink) { this._backends.push(reenumerateJlink) }

        this._reenumerate();

        this._boundReenumerate = this._reenumerate.bind(this);

        Usb.on('attach', this._boundReenumerate );
        Usb.on('detach', this._boundReenumerate );
    }

    get devices(){
        return Object.this._currentDevices;
    }

    _reenumerate(){
        // Ask all backends to reenumerate the devices they can see,
        // then (and only then) conflate everything

        debug('Asking all backends to reenumerate');

        let pendings = this._backends.map((backend)=>backend());

        Promise.all(pendings

        ).then((backendsResult)=>{
//             debug('TODO: Should conflate: ', stuff);

            this._conflate(backendsResult);
        }).catch((err)=>{
            debug('Error after reenumerating: ', err);
            this.emit('error', err);
        });

        return pendings;
    }

    _conflate(backendsResult){

//         console.log(stuff);
        debug('TODO: should conflate');

        const deviceMap = new Map();

        for (let i in backendsResult) {
            const results = backendsResult[i];
            for (let j in results) {
                const capability = results[j];
//                 debug(capability);

                let serialNumber = capability.serialNumber;
                if (serialNumber) {
                    // If the serial number is fully numeric (not a hex string),
                    // cast it into an integer
                    if (Number(serialNumber)) {
                        serialNumber = Number(serialNumber);
                    }

//                     debug(i, j, capability);
//                     debug('serialnumber', serialNumber );

                    let device = deviceMap.get(serialNumber) || {};
                    device = Object.assign({}, device, capability);
                    deviceMap.set(serialNumber, device);
                } else {
                    debug(i, j, 'error');
//                     debug('conflateerror', capability);
                    this.emit('conflateerror', capability);
                }

            }
        }

        // TODO: emit 'conflateerror' for entries without a serial number,
        // or otherwise fishy entries
        // TODO: save conflated list in this._currentDevices
        this._currentDevices = deviceMap;


//         debug('conflated', deviceMap);
        deviceMap.forEach((device, serialNumber)=> {
            const keys = Object.keys(device).filter( key=> key!=='error' && key !== 'serialNumber');
            debug(serialNumber, keys);
        });

    }


    // Stop listening to attach/detach events from USB
    // Needed to let programs exit gracefully
    stop() {
        debug('Removing event listeners for USB attach/detach');

        Usb.removeListener('attach', this._boundReenumerate );
        Usb.removeListener('detach', this._boundReenumerate );
    }

}
