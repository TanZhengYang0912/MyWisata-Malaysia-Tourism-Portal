import type { QRCodeRenderersOptions } from "qrcode";

export function getCustomerPassQrOptions(width: number): QRCodeRenderersOptions {
  return {
    width,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#010066", light: "#ffffff" },
  };
}
