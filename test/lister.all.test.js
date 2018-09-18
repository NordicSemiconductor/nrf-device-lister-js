/* Copyright (c) 2010 - 2018, Nordic Semiconductor ASA
 *
 * All rights reserved.
 *
 * Use in source and binary forms, redistribution in binary form only, with
 * or without modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions in binary form, except as embedded into a Nordic
 *    Semiconductor ASA integrated circuit in a product or a software update for
 *    such product, must reproduce the above copyright notice, this list of
 *    conditions and the following disclaimer in the documentation and/or other
 *    materials provided with the distribution.
 *
 * 2. Neither the name of Nordic Semiconductor ASA nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * 3. This software, with or without modification, must only be used with a Nordic
 *    Semiconductor ASA integrated circuit.
 *
 * 4. Any software provided in binary form under this license must not be reverse
 *    engineered, decompiled, modified and/or disassembled.
 *
 * THIS SOFTWARE IS PROVIDED BY Nordic Semiconductor ASA "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY, NONINFRINGEMENT, AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL Nordic Semiconductor ASA OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

const path = require('path');
const DeviceLister = require('../dist/device-lister');
const nrfjprog = require('pc-nrfjprog-js');

const debug = require('debug')('device-lister:test');

let lister;
const testJlinkSerialNumber = process.env.LISTER_JLINK_SERIAL_NUMBER;
const testUsbDkSerialNumber = process.env.LISTER_USB_DK_SERIAL_NUMBER;
const testUsbDongleSerialNumber = process.env.LISTER_USB_DONGLE_SERIAL_NUMBER;
const testFirmware = path.join(__dirname, 'data', 'mbr_bootloader_pca10056.hex');

describe('The Device Lister', () => {
    it('shall list jlink devices', async () => {
        lister = new DeviceLister({
            jlink: true,
        });
        const devices = await new Promise(resolve => {
            lister.on('conflated', deviceMap => {
                lister.stop();
                resolve(deviceMap);
            });
            lister.start();
        });
        expect(devices.has(testJlinkSerialNumber)).toBeTruthy();
    });

    it('shall list nordic usb devices', async () => {
        lister = new DeviceLister({
            nordicUsb: true,
        });
        const devices = await new Promise(resolve => {
            lister.on('conflated', deviceMap => {
                lister.stop();
                resolve(deviceMap);
            });
            lister.start();
        });
        expect(devices.has(testUsbDongleSerialNumber)).toBeTruthy();
    });

    it('shall list when new nordic usb device is detected', async () => {
        lister = new DeviceLister({
            nordicUsb: true,
        });

        await new Promise(resolve => {
            nrfjprog.recover(
                parseInt(testJlinkSerialNumber, 10),
                () => {
                    resolve();
                }
            );
        });
        let devices = await new Promise(resolve => {
            lister.on('conflated', deviceMap => {
                resolve(deviceMap);
            });
            lister.start();
        });
        expect(devices.has(testUsbDkSerialNumber)).toBeFalsy();
        await new Promise(resolve => {
            nrfjprog.program(parseInt(testJlinkSerialNumber, 10), testFirmware, {}, () => {
                resolve();
            });
        });
        devices = await new Promise(resolve => {
            lister.on('conflated', deviceMap => {
                lister.stop();
                resolve(deviceMap);
            });
        });
        expect(devices.has(testUsbDkSerialNumber)).toBeTruthy();
    }, 20000);
});
