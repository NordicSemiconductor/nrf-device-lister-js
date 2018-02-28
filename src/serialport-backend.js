/* Copyright (c) 2010 - 2018, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY, AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL NORDIC SEMICONDUCTOR ASA OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

import SerialPort from 'serialport';
import Debug from 'debug';

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
    return new Promise((res, rej) => {
        SerialPort.list((err, portsMetadata) => {
            if (err) {
                rej(err);
            } else {
                res(portsMetadata);
            }
        });
    }).then(portsMetadata => portsMetadata.map(portMetadata => {
        debug('Enumerated: ', portMetadata.comName, portMetadata.serialNumber);

        return {
            error: undefined,
            serialNumber: portMetadata.serialNumber,
            serialport: portMetadata,
        };
    })).catch(err => {
        debug('Error! ', err);

        return [{
            error: err,
            serialNumber: undefined,
            serialport: undefined,
        }];
    });
}
