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

const nrfjprogjs = require('pc-nrfjprog-js');
const Debug = require('debug');
const AbstractBackend = require('./abstract-backend');
const ErrorCodes = require('./util/errors');
const { getBoardVersion } = require('./util/board-versions');

const debug = Debug('device-lister:jlink');

class JlinkBackend extends AbstractBackend {
    /* Returns a `Promise` to a list of objects, like:
     *
     * [{
     *   traits: ["jlink"]
     *   serialNumber: '1234',
     * }]
     *
     * This relies on pc-nrfjprog-js, for more information see
     * https://nordicsemiconductor.github.io/pc-nrfjprog-js/module-pc-nrfjprog-js.html#.getSerialNumbers
     *
     * Please note that the device information does *not* include things such as
     * device family, or amount or RAM/ROM. This is because jlink/nrfjprog can only
     * know which probes are there, but cannot know when a probe gets disconnected
     * from a debug target and connected to another debug target.
     *
     * If there were any errors while enumerating segger probes, it will return
     * an array with just one error item, as per the AbstractBackend format.
     */
    /* eslint-disable-next-line class-methods-use-this */
    reenumerate() {
        debug('Reenumerating...');
        return new Promise((res, rej) => {
            // Due to slowness of jlink driver, jlink devices does not show up immediately
            // after connecting. Set a timeout to wait for devices getting ready.
            setTimeout(() => {
                nrfjprogjs.getSerialNumbers((err, serialnumbers) => {
                    if (err) {
                        const error = err;
                        error.errorCode = ErrorCodes.NO_SERIAL_FROM_PC_NRFJPROGJS;
                        rej(error);
                    } else {
                        res(serialnumbers);
                    }
                });
            }, 1000);
        }).then(serialnumbers => serialnumbers.map(serialnumber => {
            debug('Enumerated:', serialnumber);
            return {
                // The nrfjprogjs provides the serial numbers as integers, what we want
                // is the serial number as described in the USB descriptor (iSerialNumber).
                // The USB descriptor iSerialNumber attribute is of type string.
                //
                // Pad the serial number with '0' with the assumed serial number length of 12
                serialNumber: serialnumber.toString().padStart(12, '0'),
                boardVersion: getBoardVersion(serialnumber),
                traits: ['jlink'],
            };
        })).catch(err => {
            debug('Error:', err.errmsg);
            return [{
                error: err,
                errorSource: 'jlink',
            }];
        });
    }
}

module.exports = JlinkBackend;
