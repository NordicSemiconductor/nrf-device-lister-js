const BoardVersion = {
    680: 'PCA10031',
    681: 'PCA10028',
    682: 'PCA10040',
    683: 'PCA10056',
    684: 'PCA10068',
    685: 'PCA10100',
    686: 'PCA10064',
    9600: 'PCA10090',
    9601: 'PCA10095',
    9602: 'PCA10115',
};

const getBoardVersion = serialNumber => {
    if (serialNumber.toString().startsWith('PCA')) {
        return serialNumber.toString().split('_')[0];
    }
    const sn = parseInt(serialNumber, 10).toString();
    return BoardVersion[sn.substring(0, 4)]
        || BoardVersion[sn.substring(0, 3)];
};

module.exports = {
    BoardVersion,
    getBoardVersion,
};
