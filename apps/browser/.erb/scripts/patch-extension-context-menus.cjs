const fs = require('node:fs');
const path = require('node:path');
const marker = '// Kudium: context menu lifecycle and checked events v2';
function patchSource(source) {
  if (source.includes(marker)) return source;
  if (source.includes('// Kudium: context menu lifecycle and checked events v1')) {
    const missing = '    if (!tab) {\n      console.error(`[Extensions] Unable to find tab for id=${webContents2.id}`);\n      return;\n    }';
    const send = '    this.ctx.router.sendEvent(extensionId, "contextMenus.onClicked", data, tab);';
    if (!source.includes(missing) || !source.includes(send)) throw new Error('Context menu patch requires dependency review');
    return source.replace('// Kudium: context menu lifecycle and checked events v1', marker).replace(missing, '').replace(send, '    this.ctx.emit("context-menu-clicked", {extensionId, webContents:webContents2});\n' + send);
  }
  const start = source.indexOf('var DEFAULT_CONTEXTS =');
  const end = source.indexOf('// src/browser/api/runtime.ts', start);
  if (start < 0 || end < 0) throw new Error('Context menu patch requires dependency review');
  let block = source.slice(start, end);
  const replace = (before, after) => {
    if (!block.includes(before)) throw new Error('Context menu patch requires dependency review: ' + before.slice(0, 70));
    block = block.replace(before, after);
  };
  replace('var DEFAULT_CONTEXTS =', marker + '\nvar DEFAULT_CONTEXTS =');
  replace('        id: props.id,', '        id: JSON.stringify([extension.id, props.id]),');
  replace('        enabled: props.enabled,', '        enabled: props.enabled,\n        checked: props.checked,');
  replace('        click: () => {\n          this.onClicked(extension.id, props.id, webContents2, params);', '        click: item => {\n          this.onClicked(extension.id, props.id, webContents2, params, item.checked);');
  replace('        itemMap.set(item.props.id, menuItem);', '        itemMap.set(JSON.stringify([item.extension.id, item.props.id]), menuItem);');
  block = block.replaceAll('itemMap.get(item.props.id)', 'itemMap.get(JSON.stringify([item.extension.id, item.props.id]))');
  replace('itemMap.get(`${item.props.parentId}`)', 'itemMap.get(JSON.stringify([item.extension.id, item.props.parentId]))');
  block = block.replaceAll('if (item.props.parentId)', 'if (item.props.parentId !== undefined)').replaceAll('!opt.props.parentId', 'opt.props.parentId === undefined').replaceAll('opt.props.parentId ?', 'opt.props.parentId !== undefined ?');
  replace(`      const { id, type, title } = createProperties;
      if (this.menus.has(id)) {
        return;
      }
      if (!title && type !== "separator") {
        return;
      }
      this.addContextItem(extension.id, createProperties);`, `      const props = this.validateProperties(extension.id, createProperties);
      if (this.menus.get(extension.id)?.has(props.id)) throw new Error('Duplicate context menu ID');
      this.addContextItem(extension.id, props);`);
  replace('    this.remove = ({ extension }, menuItemId) => {', `    this.update = ({ extension }, menuItemId, changes) => {
      const items = this.menus.get(extension.id), previous = items?.get(menuItemId);
      if (!previous) throw new Error('Unknown context menu ID');
      if (!changes || typeof changes !== 'object' || changes.id !== undefined) throw new Error('Invalid context menu update');
      items.set(menuItemId, this.validateProperties(extension.id, {...previous, ...changes}));
    };
    this.remove = ({ extension }, menuItemId) => {`);
  replace('        items.delete(menuItemId);', `        const remove = id => {
          for (const [childId, child] of [...items]) if (child.parentId === id) remove(childId);
          items.delete(id);
        };
        remove(menuItemId);`);
  for (const method of ['create','remove','removeAll']) replace(`handle("contextMenus.${method}", this.${method});`, `handle("contextMenus.${method}", this.${method}, {permission:'contextMenus'});`);
  replace('    handle("contextMenus.create", this.create, {permission:\'contextMenus\'});', '    handle("contextMenus.create", this.create, {permission:\'contextMenus\'});\n    handle("contextMenus.update", this.update, {permission:\'contextMenus\'});');
  replace('  addContextItem(extensionId, props) {', `  validateProperties(extensionId, input) {
    const props = {...input};
    const id = value => typeof value === 'string' && value.length > 0 || typeof value === 'number' && Number.isSafeInteger(value);
    const contexts = new Set(['all','page','frame','selection','link','editable','image','video','audio','action','browser_action','page_action','launcher']);
    const fields = new Set(['id','type','title','checked','contexts','visible','enabled','parentId','documentUrlPatterns','targetUrlPatterns']);
    if (!id(props.id) || Object.keys(props).some(key=>!fields.has(key))) throw new Error('Invalid context menu properties');
    if (props.type !== undefined && !['normal','checkbox','radio','separator'].includes(props.type)) throw new Error('Invalid context menu type');
    if (props.type !== 'separator' && (typeof props.title !== 'string' || !props.title)) throw new Error('Context menu title is required');
    for (const key of ['checked','visible','enabled']) if (props[key] !== undefined && typeof props[key] !== 'boolean') throw new Error('Invalid context menu flag');
    if (props.contexts !== undefined && (!Array.isArray(props.contexts) || !props.contexts.length || !props.contexts.every(value=>contexts.has(value)))) throw new Error('Invalid menu contexts');
    for (const key of ['documentUrlPatterns','targetUrlPatterns']) if (props[key] !== undefined && (!Array.isArray(props[key]) || !props[key].every(value=>typeof value === 'string'))) throw new Error('Invalid menu URL patterns');
    if (props.parentId !== undefined) {
      if (!id(props.parentId)) throw new Error('Invalid menu parent');
      const items = this.menus.get(extensionId), seen = new Set([props.id]);
      let parent = props.parentId;
      while (parent !== undefined) {
        if (seen.has(parent)) throw new Error('Menu parent cycle');
        seen.add(parent);
        const entry = items?.get(parent);
        if (!entry) throw new Error('Unknown menu parent');
        parent = entry.parentId;
      }
    }
    return props;
  }
  addContextItem(extensionId, props) {`);
  replace('      contextTypes: /* @__PURE__ */ new Set(["all", menuType])', `      contextTypes: new Set(['all', menuType, ...(menuType === 'action' || menuType === 'browser_action' ? ['action','browser_action'] : [])]),
      documentUrl: activeTab?.getURL()`);
  replace('const menuItem = { extension, props, webContents: activeTab };', 'const menuItem = { extension, props, webContents: activeTab, params: {pageURL:activeTab.getURL()} };');
  replace('  onClicked(extensionId, menuItemId, webContents2, params) {\n    if (webContents2.isDestroyed()) return;', `  onClicked(extensionId, menuItemId, webContents2, params, checked) {
    if (webContents2.isDestroyed() || webContents2.session !== this.ctx.session) return;
    const extension = (this.ctx.session.extensions || this.ctx.session).getExtension(extensionId);
    const items = this.menus.get(extensionId), props = items?.get(menuItemId);
    if (!extension?.manifest.permissions?.includes('contextMenus') || !props || props.visible === false || props.enabled === false) return;
    const checkable = props.type === 'checkbox' || props.type === 'radio', wasChecked = !!props.checked;
    if (checkable) {
      props.checked = typeof checked === 'boolean' ? checked : props.type === 'radio' || !wasChecked;
      if (props.type === 'radio' && props.checked) {
        const siblings = [...items.values()].filter(item=>item.parentId === props.parentId), at = siblings.indexOf(props);
        for (const direction of [-1,1]) for(let i=at+direction; i>=0 && i<siblings.length && siblings[i].type === 'radio'; i+=direction) siblings[i].checked = false;
      }
    }`);
  replace('      checked: false,\n      // TODO', '      ...(checkable ? {checked:props.checked,wasChecked} : {}),');
  replace('      frameId: -1,', '      frameId: !params?.frameURL || params.frameURL === params.pageURL ? 0 : undefined,');
  replace('      mediaType: params?.mediaType,\n      wasChecked: false,\n      // TODO', "      mediaType: ['image','video','audio'].includes(params?.mediaType) ? params.mediaType : undefined,");
  replace('      pageUrl: params?.pageURL,', '      pageUrl: params?.pageURL || webContents2.getURL(),');
  replace('      parentMenuItemId: -1,', '      parentMenuItemId: props.parentId,');
  replace(`    if (!tab) {
      console.error(\`[Extensions] Unable to find tab for id=\${webContents2.id}\`);
      return;
    }`, '');
  replace('    this.ctx.router.sendEvent(extensionId, "contextMenus.onClicked", data, tab);', '    this.ctx.emit("context-menu-clicked", {extensionId, webContents:webContents2});\n    this.ctx.router.sendEvent(extensionId, "contextMenus.onClicked", data, tab);');
  return source.slice(0,start) + block + source.slice(end);
}
function patchPreload(source) {
  const before = 'update: invokeExtension2("contextMenus.update", { noop: true })', after = 'update: invokeExtension2("contextMenus.update")';
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error('Context menu preload requires dependency review');
  return source.replace(before,after);
}
function patchInstalled() {
  const root = path.resolve(__dirname,'../..');
  for (const tree of ['node_modules','release/app/node_modules']) for (const entry of ['dist/cjs/index.js','dist/esm/index.mjs','dist/chrome-extension-api.preload.js']) {
    const file = path.join(root,tree,'electron-chrome-extensions',entry);
    if (fs.existsSync(file)) fs.writeFileSync(file,(entry.endsWith('preload.js') ? patchPreload : patchSource)(fs.readFileSync(file,'utf8')));
  }
}
module.exports={patchSource,patchPreload,patchInstalled};
if (require.main === module) patchInstalled();
