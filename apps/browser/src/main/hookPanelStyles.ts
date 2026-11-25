/** Shared native hook presentation; custom forms opt in using these classes. */
export const hookPanelControlStyles = `
.panel-text{white-space:pre-wrap;line-height:1.55}
pre{margin:0;white-space:pre-wrap;font:12px/1.55 ui-monospace,monospace}
#panel-actions button,.kudium-button{font:inherit;font-weight:500;min-height:32px;max-width:100%;padding:6px 10px;border:0;border-radius:7px;background:color-mix(in srgb,CanvasText 8%,Canvas);color:CanvasText;cursor:pointer;overflow-wrap:anywhere}
#panel-actions button:hover:not(:disabled),.kudium-button:hover:not(:disabled){background:color-mix(in srgb,CanvasText 13%,Canvas)}
#panel-actions button:active:not(:disabled),.kudium-button:active:not(:disabled){background:color-mix(in srgb,CanvasText 18%,Canvas)}
#panel-actions button:disabled,.kudium-button:disabled{opacity:.45;cursor:default}
#panel-actions button:focus-visible,.kudium-button:focus-visible,.kudium-form :is(input,select,textarea):focus-visible{outline:2px solid var(--kudium-primary,Highlight);outline-offset:2px}
.kudium-button-primary{background:var(--kudium-primary,Highlight);color:var(--kudium-primary-contrast,HighlightText)}
.kudium-button-primary:hover:not(:disabled){background:color-mix(in srgb,var(--kudium-primary,Highlight) 88%,CanvasText)}
.kudium-form{display:grid;gap:12px;min-width:0;padding:16px}
.kudium-field{display:grid;gap:5px;min-width:0;font:inherit}
.kudium-form :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=hidden]),select,textarea){box-sizing:border-box;width:100%;min-width:0;max-width:100%;min-height:34px;padding:7px 9px;font:inherit;color:CanvasText;background:color-mix(in srgb,CanvasText 5%,Canvas);border:0;border-radius:7px}
.kudium-form textarea{min-height:80px;resize:vertical;line-height:1.5}
.kudium-form :is(input,select,textarea):disabled{opacity:.5;cursor:default}
.kudium-form :is(input,select,textarea)[aria-invalid=true]{box-shadow:inset 0 0 0 1px light-dark(#b91c1c,#fca5a5)}
.kudium-form :is(input[type=checkbox],input[type=radio],input[type=range]){accent-color:var(--kudium-primary,Highlight)}
.kudium-hint{margin:0;font-size:12px;line-height:1.4;color:color-mix(in srgb,CanvasText 65%,Canvas)}
.status,#panel-error{margin:0;padding:8px 10px;border:0;border-radius:7px;font:inherit;line-height:1.5;background:color-mix(in srgb,CanvasText 4%,transparent)}
.status.success{color:light-dark(#24633b,#95d4aa)}
.status.error,#panel-error{color:light-dark(#b91c1c,#fca5a5);background:light-dark(#b91c1c0a,#fca5a50a)}
#panel-error:not([hidden]){margin-top:10px}
`;
