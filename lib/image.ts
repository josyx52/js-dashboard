// Comprime uma foto no browser antes de a enviar como base64 — fotos de
// telemovel podem ter varios MB, e isso em base64 num pedido JSON falha
// silenciosamente ("Failed to fetch") antes de sequer chegar ao servidor.
// Reduzimos para no maximo 1024px no lado maior, qualidade JPEG 0.75 —
// mais que suficiente para o Gemini reconhecer o prato.
export function compressImageToBase64(file: File, maxSize = 1024, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas indisponivel"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
