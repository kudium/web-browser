// Diagnostic composition: Electron's window capture omits WebContentsView surfaces.
const { nativeImage, WebContentsView } = require('electron');
const assert = require('assert/strict');
module.exports = async function captureWorkspace(window) {
  const normalize = (image) =>
    nativeImage.createFromBuffer(image.toPNG({ scaleFactor: 1 }));
  const shell = normalize(await window.capturePage());
  const size = shell.getSize();
  const output = shell.toBitmap();
  assert.equal(output.length, size.width * size.height * 4);
  const bounds = window.getContentBounds();
  const scaleX = size.width / bounds.width;
  const scaleY = size.height / bounds.height;
  for (const view of window.contentView.children) {
    if (
      !(view instanceof WebContentsView) ||
      !view.getVisible() ||
      view.webContents === window.webContents
    )
      continue;
    const rect = view.getBounds();
    if (rect.width < 1 || rect.height < 1 || view.webContents.isDestroyed())
      continue;
    const width = Math.round(rect.width * scaleX),
      height = Math.round(rect.height * scaleY);
    const page = normalize(await view.webContents.capturePage()).resize({
      width,
      height,
    });
    const pixels = page.toBitmap();
    assert.equal(pixels.length, width * height * 4);
    const left = Math.round(rect.x * scaleX),
      top = Math.round(rect.y * scaleY);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (
          left + x < 0 ||
          top + y < 0 ||
          left + x >= size.width ||
          top + y >= size.height
        )
          continue;
        const source = (y * width + x) * 4,
          target = ((top + y) * size.width + left + x) * 4;
        const alpha = pixels[source + 3] / 255;
        for (let channel = 0; channel < 3; channel++)
          output[target + channel] = Math.round(
            pixels[source + channel] * alpha +
              output[target + channel] * (1 - alpha)
          );
        output[target + 3] = 255;
      }
  }
  return nativeImage.createFromBitmap(output, size).toPNG();
};
