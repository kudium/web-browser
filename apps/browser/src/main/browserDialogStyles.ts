export const browserDialogStyles = `
:root { color-scheme:light dark; font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:light-dark(#f5f5f7,#28282a); color:light-dark(#252527,#f4f4f5); }
* { box-sizing:border-box; }
:root[data-glass='true'] { background:transparent; }
:root[data-glass='true'] body { background:light-dark(#f5f5f766,#28282a66); }
:root[data-glass='true'] input, :root[data-glass='true'] textarea, :root[data-glass='true'] select, :root[data-glass='true'] .saved-input { background:light-dark(#ffffff66,#ffffff08); border-color:light-dark(#00000020,#ffffff24); }
:root[data-glass='true'] .saved-input > input, :root[data-glass='true'] .saved-input > textarea, :root[data-glass='true'] .saved-input > select { background:transparent; }
@media (prefers-reduced-transparency:reduce), (prefers-contrast:more) {
  :root[data-glass='true'], :root[data-glass='true'] body { background:light-dark(#f5f5f7,#28282a); }
}
html { height:100%; overflow:hidden; }
body { margin:0; padding:40px 24px 20px; height:100%; display:flex; flex-direction:column; }
header { display:flex; align-items:center; gap:12px; margin-bottom:12px; flex-shrink:0; }
.icon { display:grid; place-items:center; width:32px; height:32px; flex-shrink:0; color:light-dark(#737377,#b0b0b5); }
.icon svg { width:26px; height:26px; }
.icon[hidden], .eyebrow[hidden] { display:none; }
.heading { min-width:0; }
.eyebrow { font-size:11px; font-weight:500; color:light-dark(#737377,#adadb2); margin-bottom:4px; }
h1 { font-size:16px; line-height:1.35; letter-spacing:-.25px; margin:0; font-weight:600; overflow-wrap:anywhere; }
p { white-space:pre-line; line-height:1.55; margin:0 0 14px; color:light-dark(#646468,#bababe); overflow-wrap:anywhere; }
.site { padding:10px 12px; margin-bottom:14px; border:1px solid light-dark(#dedee1,#464649); border-radius:8px; background:light-dark(#fff,#303033); font-size:13px; font-weight:500; overflow-wrap:anywhere; }
.site small { display:block; font-size:11px; color:light-dark(#737377,#adadb2); margin-bottom:4px; }
.content { min-height:0; overflow:auto; flex:1; padding:3px; margin:0 -3px; }
.content > :last-child { margin-bottom:0; }
label { display:block; font-weight:500; margin:8px 0; }
select, input, textarea { width:100%; padding:7px 9px; border:1px solid light-dark(#d2d2d6,#55555a); border-radius:6px; background:light-dark(#fff,#3a3a3d); color:inherit; font:inherit; }
.input-row + .input-row { margin-top:14px; }
.input-group + .input-group { margin-top:22px; }
.input-group h2 { font-size:12px; font-weight:600; color:light-dark(#737377,#adadb2); margin:0 0 10px; }
.input-label { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.input-label label { min-width:0; overflow-wrap:anywhere; }
.required { margin-left:4px; color:light-dark(#737377,#adadb2); }
textarea { resize:vertical; min-height:70px; max-height:180px; }
.saved-input { display:flex; align-items:stretch; border:1px solid light-dark(#d2d2d6,#55555a); border-radius:7px; background:light-dark(#fff,#3a3a3d); }
.saved-input:focus-within, :root[data-glass='true'] .saved-input:focus-within { border-color:light-dark(#8b8b90,#aaaaaf); box-shadow:0 0 0 1px light-dark(#8b8b90,#aaaaaf); }
.saved-input > input, .saved-input > textarea, .saved-input > select { flex:1; min-width:0; border:0; background:transparent; outline:none; border-radius:7px 0 0 7px; box-shadow:none; }
.saved-input > .saved-picker { display:flex; align-items:center; justify-content:center; width:32px; flex:0 0 32px; min-width:32px; padding:7px; font-size:11px; font-weight:400; border:0; border-left:1px solid light-dark(#e2e2e5,#4d4d52); border-radius:0 7px 7px 0; box-shadow:none; background:transparent; color:light-dark(#66666b,#b7b7bc); }
.saved-picker:hover { background:light-dark(#00000006,#ffffff07); }
.saved-panel { position:fixed; z-index:10; padding:8px; max-height:280px; border:1px solid light-dark(#d7d7dc,#535358); border-radius:12px; background:light-dark(#f5f5f7f5,#303034f5); backdrop-filter:blur(24px); box-shadow:0 12px 36px #00000038; }
.saved-panel.saved-inline { position:static; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; backdrop-filter:none; max-height:none; }
.saved-inline .saved-results { max-height:320px; }
.saved-inline .saved-search { margin-bottom:8px; }
.saved-panel[hidden], .saved-empty[hidden] { display:none; }
.saved-search { font-size:12px; background:light-dark(#00000006,#ffffff06); border-color:light-dark(#d7d7dc,#535358); margin-bottom:6px; }
.saved-results { max-height:210px; overflow:auto; }
.saved-option { width:100%; min-width:0; border:0; box-shadow:none; border-radius:7px; background:transparent; display:flex; flex-direction:column; align-items:flex-start; gap:3px; text-align:left; padding:8px 10px; margin-top:3px; }
.saved-option:hover, .saved-option[aria-selected="true"] { background:light-dark(#00000008,#ffffff0a); }
.saved-option-name { width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
.saved-option-group + .saved-option-group { margin-top:8px; }
.saved-group-title { padding:6px 10px 3px; font-size:11px; font-weight:500; color:light-dark(#737377,#adadb2); overflow-wrap:anywhere; }
.saved-empty { font-size:12px; color:light-dark(#737377,#adadb2); padding:14px 8px; }
.input-error { display:block; color:light-dark(#b23530,#ffaaa5); margin-top:5px; }
.input-error:empty { display:none; }
.remember { display:flex; align-items:center; gap:6px; margin:8px 0 0; font-size:11px; font-weight:400; color:light-dark(#737377,#adadb2); cursor:pointer; }
.remember input { width:12px; height:12px; margin:0; }
footer > .forget-answers { display:inline-flex; align-items:center; justify-content:center; gap:6px; margin-right:auto; padding:5px 6px; min-width:0; min-height:28px; font-size:11px; font-weight:400; background:transparent; border:0; box-shadow:none; color:light-dark(#737377,#adadb2); }
footer > .forget-answers:hover:not(:disabled) { background:light-dark(#00000006,#ffffff08); color:light-dark(#252527,#f4f4f5); }
footer > .forget-answers:disabled { opacity:.45; cursor:default; }
footer > .forget-answers svg { flex-shrink:0; }

details { margin:4px 0 12px; color:light-dark(#646468,#bababe); }
summary { cursor:pointer; font-size:12px; padding:4px 0; }
details p { margin:10px 0 0; }
pre { white-space:pre-wrap; overflow-wrap:anywhere; font:11px ui-monospace,monospace; max-height:220px; overflow:auto; }
footer { display:flex; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; gap:8px; padding:0; margin:16px 0 0; }
button { font:inherit; font-weight:500; min-width:76px; min-height:28px; border:1px solid light-dark(#d2d2d6,#555559); border-radius:7px; padding:5px 12px; color:inherit; background:light-dark(#fff,#3a3a3d); box-shadow:0 1px 2px #0000000a; cursor:pointer; }
button:hover { background:light-dark(#ededf0,#46464a); }
button:active { background:light-dark(#e2e2e6,#505055); }
.primary { border-color:transparent; background:light-dark(#006cdb,#0871d9); color:#fff; }
.primary:hover { background:light-dark(#005ec2,#1680e8); }
.primary.destructive { background:light-dark(#cf302a,#c8433d); color:#fff; }
.primary.destructive:hover { background:light-dark(#ba2621,#d34e47); }
button:focus-visible { outline:none; box-shadow:none; background:light-dark(#e2e2e7,#515156); }
.primary:focus-visible { background:light-dark(#0057b5,#2585e5); }
.primary.destructive:focus-visible { background:light-dark(#ac231e,#dc544d); }
button:disabled { opacity:.45; cursor:default; }
textarea:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, pre:focus-visible { outline:1px solid light-dark(#808085,#a4a4aa); outline-offset:2px; border-radius:6px; }
select:focus-visible, input:focus-visible, textarea:focus-visible { outline-offset:-1px; }
.saved-input > input:focus-visible, .saved-input > textarea:focus-visible, .saved-input > select:focus-visible { outline:none; box-shadow:none; }
.permission-section { margin:0 0 14px; }
.permission-section h2, .permission-section summary { font-size:13px; font-weight:500; color:inherit; }
.permission-section h2 { margin:0 0 8px; }
.permission-list { margin:8px 0 0; padding-left:20px; color:light-dark(#646468,#bababe); line-height:1.55; }
.permission-list li+li { margin-top:4px; }
@media (max-width:360px) { body { padding:40px 18px 18px; } footer { gap:6px; } button { min-width:68px; padding-inline:10px; } }
`;
