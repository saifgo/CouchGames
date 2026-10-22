import QRCode from 'qrcode';

/** A real, scannable QR code as inline SVG (built at compile time, no client JS). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#1C1814', light: '#FFFFFF' },
  });
}
