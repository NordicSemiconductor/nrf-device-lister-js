
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

        this._currentDevices = {};

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

        Promise.all(
            this._backends.map((backend)=>backend())
        ).then((stuff)=>{
            this._conflate(stuff);
        }).catch(err=>this.emit('error', err));

    }

    _conflate(stuff){

//         console.log(stuff);
        debug('TODO: should conflate');

        // TODO: emit 'conflateerror' for entries without a serial number,
        // or otherwise fishy entries
        // TODO: save conflated list in this._currentDevices
    }


    // Stop listening to attach/detach events from USB
    // Needed to let programs exit gracefully
    stop() {
        debug('Removing event listeners for USB attach/detach');

        Usb.removeListener('attach', this._boundReenumerate );
        Usb.removeListener('detach', this._boundReenumerate );
    }

}
