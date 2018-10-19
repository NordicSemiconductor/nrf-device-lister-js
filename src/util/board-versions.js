export const BoardVersion = {
    680: 'PCA10031',
    681: 'PCA10028',
    682: 'PCA10040',
    683: 'PCA10056',
    684: 'PCA10068',
    686: 'PCA10064',
    960: 'PCA10090',
};

export const getBoardVersion = serialNumber => {
    const sn = parseInt(serialNumber, 10).toString();
    const digits = sn.substring(0, 3);
    return BoardVersion[digits];
};
