
import nrfjprogjs from 'pc-nrfjprog-js';
import Debug from 'debug'

const debug = Debug('device-lister:jlink');

/* Returns a Promise to a list of objects, like:
 *
 * [{
 *   error: undefined
 *   serialNumber: 1234,
 *   jlink: true
 * }]
 *
 * This relies on pc-nrfjprog-js, for more information see
 * https://nordicsemiconductor.github.io/pc-nrfjprog-js/module-pc-nrfjprog-js.html#.getSerialNumbers
 *
 * Please note that the device information does *not* include things such as device family,
 * or amount or RAM/ROM. This is because jlink/nrfjprog can only know which probes are there,
 * but cannot know when a probe gets disconnected from a debug target and connected
 * to another debug target.
 *
 * If there were any errors while enumerating serial ports, the array will contain only
 * one item like:
 *
 * [{
 *   error: (instance of Error)
 *   serialNumber: undefined,
 *   jlink: undefined
 * }]
 *
 */

export default function reenumerateJlinks() {
    debug('Reenumerating...');
    return new Promise((res, rej)=>{
        nrfjprogjs.getSerialNumbers((err, serialnumbers)=>{
            if (err) {rej(err);} else {res(serialnumbers);}
        });
    }).then((serialnumbers)=>serialnumbers.map(serialnumber=>{
        debug('Enumerated:', serialnumber);
        return {
            error: undefined,
            serialNumber: serialnumber,
            jlink: true
        }
    })).catch(err=>{
        debug('Returning error!', err.errmsg);
        return [{
            error: err,
            serialNumber: undefined,
            jlink: undefined
        }];
    });
}




