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

export default class AbstractBackend {
    constructor() {
        if (this.constructor === AbstractBackend) {
            throw new Error('Cannot instantiate AbstractBackend.');
        }
    }

    /*
     * Implementations can optionally run some code whenever the device lister
     * starts and stops listening for changes.
     */
    /* eslint-disable-next-line class-methods-use-this */
    start() {}

    /* eslint-disable-next-line class-methods-use-this */
    stop() {}

    /* Implementations must returns a `Promise` to an array of objects, like:
     *
     * [{
     *   traits: ['foo', 'bar']
     *   serialNumber: '1234',
     *   backendData: {
     *      serialNumber: '1234',
     *      manufacturer: 'Arduino LLC (www.arduino.cc)',
     *      devNode: '/dev/foobar'
     *   }
     * },{
     *   error: new Error(...),
     *   errorSource: "Unique-ID-for-the-error-source"
     * }]
     *
     * These objects can either be devices with traits known by a specific
     * backend, or errors that the backend wants to raise up.
     *
     * Devices with traits *must* have the `traits` and `serialNumber` properties,
     * plus an optional property containing backend-specific data.
     *
     * Errors are synchronously raised upwards to the conflater, and must include
     * a unique identifier for the source/reason of the error.
     */
    reenumerate() {
        throw new Error(`Reenumerate must be implemented in ${this.constructor.name}`);
    }
}
