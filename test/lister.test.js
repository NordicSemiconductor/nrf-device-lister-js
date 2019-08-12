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
const nrfjprog = require('pc-nrfjprog-js');
const DeviceLister = require('../dist/device-lister');

const { getBoardVersion } = DeviceLister;

const testJlinkSerialNumber = process.env.NRF52840_DK_JLINK_SERIAL_NUMBER;
const testUsbSerialNumber = process.env.NRF52840_DK_USB_SERIAL_NUMBER;
const testFirmwarePath = path.join(__dirname, 'data', 'mbr_bootloader_pca10056.hex');

let lister;

describe('The Device Lister Traits', () => {
    it('shall list jlink devices', async () => {
        const devices = await new DeviceLister({
            jlink: true,
        }).reenumerate();
        expect(Array.from(devices.values()).find(d => d.traits.includes('jlink'))).not.toBeUndefined();
    });

    // skip this test, since nordicUsb devices are filtered out of
    // usb backend due to Windows LIBUSB_ERROR
    it.skip('shall list nordic usb devices', async () => {
        const devices = await new DeviceLister({
            nordicUsb: true,
        }).reenumerate();
        expect(Array.from(devices.values()).find(d => d.traits.includes('nordicUsb'))).not.toBeUndefined();
    });
});

describe('The Device Lister Dynamic', () => {
    it('shall list when new nordic usb device is detected', async () => {
        if (!testJlinkSerialNumber || !testUsbSerialNumber) {
            return;
        }

        lister = new DeviceLister({
            nordicUsb: true,
        });

        // Erase the flash and shall not see Nordic USB CDC ACM interface.
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
        expect(devices.has(testUsbSerialNumber)).toBeFalsy();

        // Program MBR and Bootloader to the device and shall see Nordic USB CDC ACM interface now.
        await new Promise(resolve => {
            nrfjprog.program(parseInt(testJlinkSerialNumber, 10), testFirmwarePath, {}, () => {
                resolve();
            });
        });
        devices = await new Promise(resolve => {
            lister.on('conflated', deviceMap => {
                lister.stop();
                resolve(deviceMap);
            });
        });
        expect(devices.has(testUsbSerialNumber)).toBeTruthy();
    }, 20000);
});

describe('The Device Versions', () => {
    it('shall get corerct device board versions', async () => {
        expect(getBoardVersion('68000000')).toBe('PCA10031');
        expect(getBoardVersion('68100000')).toBe('PCA10028');
        expect(getBoardVersion('68200000')).toBe('PCA10040');
        expect(getBoardVersion('68300000')).toBe('PCA10056');
        expect(getBoardVersion('68400000')).toBe('PCA10068');
        expect(getBoardVersion('68600000')).toBe('PCA10064');
        expect(getBoardVersion('96000000')).toBe('PCA10090');

        expect(getBoardVersion('12300000')).toBeUndefined();
    });
});
