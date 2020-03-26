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

const SerialPort = require('serialport');
const Debug = require('debug');
const AbstractBackend = require('./abstract-backend');
const ErrorCodes = require('./util/errors');
const { getBoardVersion } = require('./util/board-versions');

const debug = Debug('device-lister:serialport');

let hasShownDeprecatedPropertyWarning = false;
const mayShowWarningAboutDeprecatedProperty = () => {
    if (!hasShownDeprecatedPropertyWarning) {
        console.warn('Using the property "comName" has been deprecated. You should now use "path". The property will be removed in the next major release.');
    }
    hasShownDeprecatedPropertyWarning = true;
};
const withDucktapedComName = port => ({
    ...port,
    get comName() {
        mayShowWarningAboutDeprecatedProperty();
        return port.path;
    },
});

class SerialPortBackend extends AbstractBackend {
    /* Returns a Promise to a list of objects, like:
     *
     * [{
     *   traits: 'serialport'
     *   serialNumber: '1234',
     *   serialport: {
     *      path: 'COM3',
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
     * If there were any errors while enumerating serial ports, it will return
     * an array with just one error item, as per the AbstractBackend format.
     *
     * Serial ports without serial numbers will be converted into an error item
     * each, as per the AbstractBackend format.
     */
    /* eslint-disable-next-line class-methods-use-this */
    reenumerate() {
        debug('Reenumerating...');
        return SerialPort.list()
            .then(ports => (
                ports.map(port => {
                    debug('Enumerated:', port.path, port.serialNumber);
                    if (port.serialNumber !== undefined) {
                        return {
                            serialNumber: port.serialNumber,
                            serialport: withDucktapedComName(port),
                            boardVersion: getBoardVersion(port.serialNumber),
                            traits: ['serialport'],
                        };
                    }
                    const err = new Error(`Could not fetch serial number for serial port at ${port.path}`);
                    err.serialport = withDucktapedComName(port);
                    err.errorCode = ErrorCodes.COULD_NOT_FETCH_SNO_FOR_PORT;
                    return {
                        error: err,
                        errorSource: `serialport-${port.path}`,
                    };
                })
            )).catch(error => {
                debug('Error:', error);
                return [{
                    error,
                    errorSource: 'serialport',
                }];
            });
    }
}

module.exports = SerialPortBackend;
