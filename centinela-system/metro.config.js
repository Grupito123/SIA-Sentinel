const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// qr-entrada vive FUERA del repo único (dos niveles arriba de esta carpeta,
// en la principal "Sia sentinel") y es la página que muestra el QR en la entrada.
// Metro necesita verla para poder empaquetar qr-core.js, que la app importa
// desde src/qr/qrDinamico.js (mismo archivo que usa la página → secreto sincronizado).
config.watchFolders = [path.resolve(__dirname, '..', '..', 'qr-entrada')];

module.exports = config;
