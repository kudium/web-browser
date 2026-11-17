import { createHash } from 'crypto';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';

const marker = '__KUDIUMBROWSER_PRODUCTION_CSP__';

/** Authorize emitted script bytes rather than arbitrary same-origin files. */
export class RendererCSPPlugin {
  private readonly name = 'RendererCSPPlugin';

  apply(compiler: webpack.Compiler) {
    compiler.hooks.thisCompilation.tap(this.name, (compilation) => {
      const hashes: string[] = [];
      const hooks = HtmlWebpackPlugin.getHooks(compilation);
      hooks.alterAssetTagGroups.tap(this.name, (data) => {
        const scriptHash = (filename: string) => {
          const asset = compilation.getAsset(filename);
          if (!asset)
            throw new Error(`Missing production script asset: ${filename}`);
          return `sha256-${createHash('sha256')
            .update(asset.source.source())
            .digest('base64')}`;
        };
        [...data.headTags, ...data.bodyTags]
          .filter((tag) => tag.tagName === 'script')
          .forEach((tag) => {
            const { src } = tag.attributes;
            if (typeof src !== 'string' || !src.startsWith('./'))
              throw new Error(
                'Production scripts must be emitted local assets.',
              );
            const hash = scriptHash(src.slice(2));
            tag.attributes.integrity = hash;
            hashes.push(`'${hash}'`);
          });
        // Async chunks are absent from the HTML tags. The SRI plugin attaches
        // their integrity attributes at runtime; CSP must authorize those same
        // emitted bytes without allowing arbitrary local or remote scripts.
        for (const chunk of compilation.chunks)
          for (const filename of chunk.files)
            if (filename.endsWith('.js'))
              hashes.push(`'${scriptHash(filename)}'`);
        return data;
      });
      hooks.beforeEmit.tap(this.name, (data) => {
        if (!hashes.length || !data.html.includes(marker))
          throw new Error('Production renderer CSP was not generated.');
        const policy = [
          "default-src 'none'",
          `script-src ${[...new Set(hashes)].join(' ')}`,
          "script-src-attr 'none'",
          // Radix, React geometry and extension shadow roots use dynamic styles.
          "style-src 'self' 'unsafe-inline'",
          // Saved icons may contain legacy/custom web URLs; native favicons and
          // captures are data URLs. crx is the local extension icon protocol.
          "img-src 'self' data: blob: crx: https: http:",
          'media-src data: blob:',
          "font-src 'self' data:",
          "connect-src 'none'",
          "object-src 'none'",
          'frame-src https://browser.kudium.com',
          "worker-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
        ].join('; ');
        // HTML minification may unquote the single-word placeholder. Restore
        // quotes when inserting the space-separated policy after minification.
        const unquoted = `content=${marker}`;
        data.html = data.html.includes(unquoted)
          ? data.html.replace(unquoted, `content="${policy}"`)
          : data.html.replace(marker, policy);
        return data;
      });
    });
  }
}
