export const browserDialogStyles = `
:root { color-scheme:light dark; font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:light-dark(#f5f5f7,#28282a); color:light-dark(#252527,#f4f4f5); }
* { box-sizing:border-box; }
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
select { width:100%; padding:7px 9px; border:1px solid light-dark(#d2d2d6,#55555a); border-radius:6px; background:light-dark(#fff,#3a3a3d); color:inherit; font:inherit; }
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
select:focus-visible, summary:focus-visible, pre:focus-visible { outline:1px solid light-dark(#808085,#a4a4aa); outline-offset:2px; border-radius:6px; }
select:focus-visible { outline-offset:-1px; }
.permission-section { margin:0 0 14px; }
.permission-section h2, .permission-section summary { font-size:13px; font-weight:500; color:inherit; }
.permission-section h2 { margin:0 0 8px; }
.permission-list { margin:8px 0 0; padding-left:20px; color:light-dark(#646468,#bababe); line-height:1.55; }
.permission-list li+li { margin-top:4px; }
@media (max-width:360px) { body { padding:40px 18px 18px; } footer { gap:6px; } button { min-width:68px; padding-inline:10px; } }
`;
