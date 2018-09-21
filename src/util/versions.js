export const BoardVersion = Map({
    682: 'PCA10040',
});

export const getBoardVersion = serialNumber => {
    const sn = parseInt(serialNumber, 10).toString();
    const digits = sn.substring(0, 3);
    return BoardVersion.get(digits);
};
