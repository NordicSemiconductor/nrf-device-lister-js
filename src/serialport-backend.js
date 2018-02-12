
import SerialPort from 'serialport';
import Debug from 'debug'

const debug = Debug('device-lister:serialport');

/* Returns a Promise to a list of objects, like:
 *
 * [{
 *   error: undefined
 *   serialNumber: 1234,
 *   serialport: {
 *      comName: 'COM3',
 *      manufacturer: 'Arduino LLC (www.arduino.cc)',
 *      serialNumber: '752303138333518011C1',
 *      pnpId: 'USB\\VID_2341&PID_0043\\752303138333518011C1',
 *      locationId: 'Port_#0003.Hub_#0001',
 *      productId: '0043',
 *      vendorId: '2341',
 *      //serialport: (instance of SerialPort),         // Maybe???
 *   }
 * }]
 *
 * See https://doclets.io/node-serialport/node-serialport/master#dl-SerialPort-list
 *
 * If there were any errors while enumerating serial ports, the array will contain only
 * one item like:
 *
 * [{
 *   error: (instance of Error)
 *   serialNumber: undefined,
 *   serialport: undefined
 * }]
 *
 */

export default function reenumerateSerialPort() {
    debug('Reenumerating...');
    return new Promise((res, rej)=>{
        SerialPort.list((err, portsMetadata)=>{
            if (err) {rej(err);} else {res(portsMetadata);}
        });
    }).then((portsMetadata)=>portsMetadata.map(portMetadata=>{

        debug('Enumerated: ', portMetadata.comName, portMetadata.serialNumber);

        return {
            error: undefined,
            serialNumber: portMetadata.serialNumber,
            serialport: portMetadata
        }
    })).catch(err=>{
        debug('Error! ', err);

        return [{
            error: err,
            serialNumber: undefined,
            serialport: undefined
        }];
    });
}

