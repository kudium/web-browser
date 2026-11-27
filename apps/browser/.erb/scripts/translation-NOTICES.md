# Offline page translation

Bergamot Translator 0.4.9 is licensed under MPL-2.0.
Source: https://github.com/browsermt/bergamot-translator
The npm package and WebAssembly binary are pinned by the package lock.
Kudium copies the upstream worker into a CommonJS entry, adding three Node
globals required by the upstream importScripts compatibility layer. The wrapper
and model handling source is available in Kudium's public browser repository:
https://github.com/kudium/web-browser

Translation model registry: Bergamot models sandbox 0.3.3, production models.
https://storage.googleapis.com/bergamot-models-sandbox/0.3.3/registry.json
Model source: https://github.com/mozilla/firefox-translations-models (MPL-2.0).
Kudium pins filenames, lengths and SHA-256 digests in translationModels.json.
Models are downloaded only on demand and are not included in the installer.

Language detection: franc-min 6.2.0 (MIT).
Source and license: https://github.com/wooorm/franc
