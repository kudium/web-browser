const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

module.exports = async ({ main, evaluate, out, url, nativeMenu }) => {
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async expression => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await evaluate(main, expression)) return;
      await wait(30);
    }
    fs.writeFileSync(path.join(out, 'space-search-failure.png'), (await main.capturePage()).toPNG());
    const state=await evaluate(main, `({active:document.activeElement?.outerHTML,heading:document.querySelector('.space-heading')?.outerHTML,sidebar:document.querySelector('.workspace-sidebar')?.getBoundingClientRect().toJSON(),favoriteStyles:Array.from(document.querySelectorAll('.favorites-grid .sidebar-app'),b=>({name:b.getAttribute('aria-label'),style:b.getAttribute('style'),active:b.getAttribute('aria-current')})),tabColors:Array.from(document.querySelectorAll('.horizontal-tab'),b=>({id:b.dataset.tabMotion,style:b.getAttribute('style')}))})`);
    state.pages = await Promise.all(main.contentView.children.filter(view=>view.webContents && !view.webContents.isDestroyed()).map(async view=>({url:view.webContents.getURL(),meta:await view.webContents.executeJavaScript(`document.querySelector('meta[name="theme-color"]')?.content`).catch(()=>undefined)})));
    throw new Error('Space search timed out: ' + expression + ' '+JSON.stringify(state));
  };
  const spaces = [
    { id: 'default', name: 'Personal', color: 'iris', folders: [{ id: 'work', name: 'Atlas Studio' }] },
    { id: 'other', name: 'Other', color: 'green', folders: [] },
  ];
  const tabs = [
    { id: 'favorite', sessionId: 'favorite-group', sessionName: 'Reference', customName: 'Pinned reference', name: 'Reference', favorite: true },
    ...[2, 3].flatMap(count => Array.from({length:count}, (_, index) => ({
      id: 'favorite-' + count + '-' + index,
      sessionId: 'favorite-' + count,
      sessionName: count === 2 ? 'Pair' : 'Stack',
      name: 'Favorite ' + index,
      favorite: true,
      url: url + '/favorite-theme?color=' + (count === 2 ? ['c0392b', '568fe0'][index] : 'none'),
      icon: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" rx="4" fill="' + ['#4a6966', '#b77952', '#697da8'][index] + '"/></svg>').toString('base64'),
    }))),
    { id: 'research', sessionId: 'research-group', sessionName: 'Café Research', name: 'Home', folderId: 'work', pinned: true },
    { id: 'faq', sessionId: 'research-group', sessionName: 'Café Research', customName: 'Trading availability FAQ', name: 'FAQ', folderId: 'work', pinned: true, url: url + '/theme-fixture?market=alpaca' },
    { id: 'planning', sessionId: 'planning-group', sessionName: 'Planning', name: 'Home', folderId: 'work', pinned: true },
    { id: 'shopping', sessionId: 'shopping-group', sessionName: 'Shopping', name: 'Home', pinned: false, groupDisplay: 'folder' },
    { id: 'foreign', sessionId: 'foreign-group', sessionName: 'Research elsewhere', name: 'Home', spaceId: 'other' },
    { id: 'archived', sessionId: 'archived-group', sessionName: 'Research archived', name: 'Home', archived: true },
  ].map(tab => ({ url: url + '/theme-fixture', icon: '', spaceId: 'default', ...tab }));
  await evaluate(main, `localStorage.setItem('user_apps',${JSON.stringify(JSON.stringify(tabs))});localStorage.setItem('user_last_app_id','shopping');localStorage.setItem('kudiumbrowser-spaces',${JSON.stringify(JSON.stringify(spaces))});localStorage.setItem('kudiumbrowser-collapsed-spaces','["default"]');localStorage.setItem('kudiumbrowser-collapsed-folders','["work"]');undefined`);
  await main.reload();
  await until(`!!document.querySelector('.space-title-search')`);
  await wait(500);
  const click = async selector => {
    const point = await evaluate(main, `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    main.focus(); main.webContents.focus();
    main.webContents.sendInputEvent({type:'mouseMove', ...point});
    await wait(100);
    main.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    main.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
    await wait(70);
  };
  const names = () => evaluate(main, `[...document.querySelectorAll('#space-group-list .space-search-result')].map(b=>b.getAttribute('aria-label'))`);
  const headerLayout = () => evaluate(main, `(()=>{const h=document.querySelector('.space-heading').getBoundingClientRect(),icon=document.querySelector('.space-title-search .space-search-icon > svg, .space-group-search .space-search-icon > svg').getBoundingClientRect(),menu=document.querySelector('.space-title-menu').getBoundingClientRect();return {top:h.top,bottom:h.bottom,height:h.height,iconLeft:icon.left,iconTop:icon.top,menuLeft:menu.left,favoriteHeight:document.querySelector('.favorites-grid').getBoundingClientRect().height}})()`);
  const assertStable = (actual, expected, message) => assert(Object.keys(expected).every(key => Math.abs(actual[key]-expected[key]) < 0.5), message + ': ' + JSON.stringify({actual,expected}));
  assert(await evaluate(main, `document.querySelector('#space-group-list').hidden`), 'Fixture starts collapsed');
  const initialLayout = await headerLayout();

  assert(await evaluate(main, `(()=>{const h=document.querySelector('.space-heading').getBoundingClientRect(),icon=document.querySelector('.space-title-search .space-search-icon > svg').getBoundingClientRect();const text=document.querySelector('.space-title-name').getBoundingClientRect();return Math.abs(icon.left-h.left-8)<.5&&Math.abs(text.left-icon.right-8)<.5})()`), 'Search icon and title use the original compact left inset and icon gap');
  assert(await evaluate(main, `document.querySelector('.space-title-search').textContent==='Search Personal'&&Number(getComputedStyle(document.querySelector('.space-title-search .space-search-icon')).opacity)>.6&&!document.querySelector('.space-title-icon')`), 'Idle heading shows a single leading search icon and Search space name placeholder');
  assert(initialLayout.favoriteHeight > 0, 'Fixture includes a favorite strip');
  await click('.space-title-search');
  await until(`document.activeElement?.matches('.space-group-search input')`);
  assertStable(await headerLayout(), initialLayout, 'Opening search leaves the header and surrounding content in place');
  main.webContents.insertText('cafe');
  await until(`document.querySelector('.space-search-status')?.textContent==='2 matching tabs'`);
  assertStable(await headerLayout(), initialLayout, 'Typing leaves the favorite strip and header geometry unchanged');
  assert(await evaluate(main, `getComputedStyle(document.querySelector('.favorites-grid')).visibility==='visible'&&!document.querySelector('.favorites-grid').hasAttribute('inert')`), 'Favorites remain visible and interactive during search');
  await click('.favorites-grid .sidebar-app');
  await until(`!!document.querySelector('.favorites-grid .sidebar-app[aria-current="page"]')`);
  assert(await evaluate(main, `document.querySelector('.space-group-search input').value==='cafe'`), 'Favorites can be opened without losing the search');
  assertStable(await headerLayout(), initialLayout, 'Opening a favorite does not shift the search header');
  assert((await names()).includes('Trading availability FAQ'), 'Search finds an accented group in a collapsed collection, excludes other spaces and archived groups');
  assert(await evaluate(main, `document.querySelectorAll('#space-group-list .sidebar-app').length===0`), 'Search shows tab rows only');
  await click('.space-search-result[aria-label="Trading availability FAQ"]');
  await until(`document.querySelector('.space-search-result[aria-label="Trading availability FAQ"]').getAttribute('aria-current')==='page'`);
  assert(await evaluate(main, `document.querySelector('.space-group-search input').value==='cafe'`), 'Selecting a result retains filter');
  for (const width of [240, 300, 420]) {
    await evaluate(main, `document.querySelector('.workspace-sidebar').style.width='${width}px';undefined`);
    await wait(200);
    const filteredLayout = await headerLayout();
    await click('.space-group-search input');
    main.webContents.sendInputEvent({type:'keyDown', keyCode:'Escape'});
    main.webContents.sendInputEvent({type:'keyUp', keyCode:'Escape'});
    await until(`!!document.querySelector('.space-title-search')`);
    assertStable(await headerLayout(), filteredLayout, 'Closing search does not move content at ' + width);
    const idleCrop = await evaluate(main, `(()=>{const r=document.querySelector('.space-heading').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y)-4,width:Math.ceil(r.width),height:Math.ceil(r.height)+8}})()`);
    fs.writeFileSync(path.join(out, 'space-search-placeholder-' + width + '.png'), (await main.capturePage(idleCrop)).toPNG());
    await wait(150);
    await click('.space-title-search');
    await until(`document.activeElement?.matches('.space-group-search input')`);
    assert(await evaluate(main, `document.querySelector('.space-group-search input').placeholder==='Search Personal'`), 'Input keeps the space-specific placeholder');
    assertStable(await headerLayout(), filteredLayout, 'Empty search has the same geometry at ' + width);
    main.webContents.insertText('cafe');
    await until(`document.querySelector('.space-search-status')?.textContent==='2 matching tabs'`);
    assertStable(await headerLayout(), filteredLayout, 'Filtering has the same geometry at ' + width);
    assert(await evaluate(main, `(()=>{const h=document.querySelector('.space-heading'),r=h.getBoundingClientRect(),i=h.querySelector('input'),ir=i.getBoundingClientRect(),bs=[...h.querySelectorAll('button')].map(b=>b.getBoundingClientRect());return ir.width>60&&h.scrollWidth<=h.clientWidth+1&&bs.every(b=>b.left>=r.left-1&&b.right<=r.right+1)&&bs.every(b=>b.right<=ir.left+1||b.left>=ir.right-1)})()`), 'Search controls fit without overlap at ' + width);
    await click('.space-group-search input');
    const focused = await evaluate(main, `(()=>{const h=document.querySelector('.space-heading'),s=getComputedStyle(h);return {height:h.getBoundingClientRect().height,background:s.backgroundColor,shadow:s.boxShadow,radius:s.borderRadius,inputHeight:h.querySelector('input').getBoundingClientRect().height,focused:h.contains(document.activeElement)}})()`);
    assert(focused.focused && focused.height >= 38 && focused.inputHeight >= 32, 'Focused search has comfortable height');
    const crop = await evaluate(main, `(()=>{const r=document.querySelector('.space-heading').getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y)-4,width:Math.ceil(r.width),height:Math.ceil(r.height)+8}})()`);
    fs.writeFileSync(path.join(out, 'space-search-focused-' + width + '.png'), (await main.capturePage(crop)).toPNG());
    await click('.space-search-result');
    main.webContents.sendInputEvent({type:'mouseMove', x:1000, y:700});
    await wait(100);
    const blurred = await evaluate(main, `(()=>{const h=document.querySelector('.space-heading'),s=getComputedStyle(h);return {background:s.backgroundColor,shadow:s.boxShadow,radius:s.borderRadius,focused:h.contains(document.activeElement)}})()`);
    assert(!blurred.focused, 'Fixture moves focus away from the search');
    assertStable(await headerLayout(), filteredLayout, 'Blur does not move content at ' + width);
    assert(focused.background !== 'rgba(0, 0, 0, 0)' && focused.shadow !== 'none', 'Search has a visible container');
    assert.deepEqual({background:blurred.background,shadow:blurred.shadow,radius:blurred.radius}, {background:focused.background,shadow:focused.shadow,radius:focused.radius}, 'Search container persists after losing focus');
    fs.writeFileSync(path.join(out, 'space-search-unfocused-' + width + '.png'), (await main.capturePage(crop)).toPNG());
  }
  await click('[aria-label="Clear group search"]');
  main.webContents.insertText('not-found');
  await until(`document.querySelector('.space-search-status')?.textContent==='No matching tabs'`);
  assert.deepEqual(await names(), []);
  await click('[aria-label="Clear group search"]');
  main.webContents.insertText('shopping');
  await until(`document.querySelector('.space-search-status')?.textContent==='1 matching tab'`);
  assert((await names()).length===1, 'Search includes an unpinned group once');
  await click('[aria-label="Clear group search"]');
  main.webContents.insertText('availability');
  await until(`document.querySelector('.space-search-status')?.textContent==='1 matching tab'`);
  assert.deepEqual(await names(), ['Trading availability FAQ'], 'Only matching tab titles appear');
  assert(await evaluate(main, `document.querySelectorAll('.space-search-result').length===1&&document.querySelector('.space-search-result').textContent.includes('Trading availability FAQ')`));
  await click('.space-search-result');
  await until(`document.querySelector('.space-search-result').getAttribute('aria-current')==='page'`);
  assert(await evaluate(main, `localStorage.getItem('user_last_app_id')==='faq'`), 'Matching tab opens directly');
  await click('[aria-label="Clear group search"]');
  main.webContents.insertText('alpaca');
  await until(`document.querySelector('.space-search-status')?.textContent==='1 matching tab'`);
  assert(await evaluate(main, `document.querySelectorAll('.space-search-result').length===1`), 'Tab URL is searchable');
  await click('[aria-label="Clear group search"]');
  main.webContents.insertText('atlas');
  await until(`document.querySelector('.space-search-status')?.textContent==='3 matching tabs'`);
  assert((await names()).length===3, 'Collection name finds its tabs');
  fs.writeFileSync(path.join(out, 'space-group-search.png'), (await main.capturePage()).toPNG());
  main.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  main.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await until(`!!document.querySelector('.space-title-search')&&document.querySelector('#space-group-list').hidden`);
  assert(await evaluate(main, `localStorage.getItem('kudiumbrowser-collapsed-folders')==='["work"]'`), 'Search never changes saved collapse preferences');
  await click('.space-title-search');
  main.webContents.insertText('cafe');
  await until(`!!document.querySelector('.space-search-status')`);
  await click('[aria-label="Switch to Other"]');
  await until(`!!document.querySelector('.space-title-search[aria-label="Search Other"]')`);
  assert(await evaluate(main, `!document.querySelector('.space-group-search')`), 'Changing space resets search');
  await click('[aria-label="Switch to Personal"]');
  await until(`!!document.querySelector('.space-title-search[aria-label="Search Personal"]')`);
  assert(await evaluate(main, `!document.querySelector('.space-group-search')&&document.querySelector('#space-group-list').hidden`));
  await evaluate(main, `document.querySelector('.workspace-sidebar').style.width='240px';undefined`);
  await wait(350);
  for (const label of ['Expand Groups', 'Collapse Groups']) {
    await click('.space-title-menu');
    let item;
    for (let attempt=0;attempt<40;attempt++) {
      item=nativeMenu()?.items.find(candidate=>candidate.label===label);
      if (item) break;
      await wait(30);
    }
    assert(item, 'Space options preserve the ' + label + ' action: ' + JSON.stringify(nativeMenu()?.items.map(candidate=>candidate.label)));
    item.click();
    nativeMenu().closePopup();
    await until(`document.querySelector('#space-group-list').hidden===${label==='Collapse Groups'}`);
    if (label === 'Expand Groups') {
      for (const width of [240, 300, 420]) {
        await evaluate(main, `document.querySelector('.workspace-sidebar').style.width='${width}px';undefined`);
        await wait(350);
        const hierarchy = await evaluate(main, `(()=>{const row=document.querySelector('.sidebar-app[aria-label="Shopping"]'),groupIcon=row.querySelector('.group-icon-slot').getBoundingClientRect(),groupText=row.querySelector('.sidebar-app-copy').getBoundingClientRect(),collectionIcon=document.querySelector('.sidebar-collection-icon').getBoundingClientRect(),collectionText=document.querySelector('.folder-heading strong').getBoundingClientRect(),parentIcon=document.querySelector('.space-search-icon').getBoundingClientRect(),parentText=document.querySelector('.space-title-name').getBoundingClientRect();return {groupIcon:groupIcon.left,collectionIcon:collectionIcon.left,groupText:groupText.left,collectionText:collectionText.left,parentIcon:parentIcon.left,parentText:parentText.left}})()`);
        assert(Math.abs(hierarchy.groupIcon-hierarchy.collectionIcon)<.5 && Math.abs(hierarchy.groupText-hierarchy.collectionText)<.5, 'Top-level groups and collections share icon and text columns at '+width+': '+JSON.stringify(hierarchy));
        assert(hierarchy.parentIcon<=hierarchy.groupIcon && hierarchy.parentText<hierarchy.groupText, 'Space title reads as the parent without a large blank gutter at '+width);
        fs.writeFileSync(path.join(out, 'sidebar-hierarchy-' + width + '.png'), (await main.capturePage()).toPNG());
      }
      await evaluate(main, `document.querySelector('.workspace-sidebar').style.width='240px';undefined`);
      await wait(350);
      await click('.folder-heading');
      await until(`document.querySelector('.folder-heading').getAttribute('aria-expanded')==='true'`);
      assert(await evaluate(main, `(()=>{const outside=document.querySelector('.sidebar-app[aria-label="Shopping"] .group-icon-slot').getBoundingClientRect(),inside=document.querySelector('.folder-content .sidebar-app .group-icon-slot').getBoundingClientRect();return inside.left-outside.left>=7.5&&inside.left-outside.left<=8.5})()`), 'Groups inside collections retain a compact 8px nesting level');
      await click('.folder-heading');
      await click('.sidebar-app[aria-label="Shopping"]');
      await until(`document.querySelector('.sidebar-app[aria-label="Shopping"]').getAttribute('aria-expanded')==='true'`);
      await wait(300);
      await click('.sidebar-group[data-expanded=true] .sidebar-group-tab-select');
      await until(`!!document.querySelector('.sidebar-group[data-expanded=true] .sidebar-group-tab.active')`);
      assert(await evaluate(main, `(()=>{const group=document.querySelector('.sidebar-app[aria-label="Shopping"]').closest('.sidebar-group'),heading=group.querySelector('.group-icon-slot').getBoundingClientRect(),tab=group.querySelector('.sidebar-group-tab-select .app-icon').getBoundingClientRect();return tab.left-heading.left>=11.5&&tab.left-heading.left<=12.5})()`), 'Folder-group tabs have a balanced 12px indent');
      assert(await evaluate(main, `(()=>{const group=document.querySelector('.sidebar-app[aria-label="Shopping"]').closest('.sidebar-group'),tab=group.querySelector('.sidebar-group-tab'),collection=getComputedStyle(document.querySelector('.folder-heading strong')),heading=getComputedStyle(group.querySelector('.sidebar-app-copy strong')),favorite=document.querySelector('.favorites-grid .sidebar-app');return parseFloat(collection.fontSize)<parseFloat(heading.fontSize)&&heading.fontWeight==='500'&&getComputedStyle(tab).fontWeight==='400'&&getComputedStyle(tab).backgroundColor!==getComputedStyle(group).backgroundColor&&favorite.getBoundingClientRect().height===40})()`), 'Collection, folder and tab typography differ; selection stands above the group tint; favorites stay compact');
      fs.writeFileSync(path.join(out, 'sidebar-nesting-240.png'), (await main.capturePage()).toPNG());
      await click('.folder-heading');
      await until(`document.querySelector('.folder-heading').getAttribute('aria-expanded')==='true'`);
      await wait(300);
      await evaluate(main, `document.activeElement?.blur();undefined`);
      main.webContents.sendInputEvent({type:'mouseMove', x:1000, y:700});
      for (const width of [240, 300, 420]) {
        await evaluate(main, `document.querySelector('.workspace-sidebar').style.width='${width}px';undefined`);
        await wait(350);
        const favorites = await evaluate(main, `Array.from(document.querySelectorAll('.favorites-grid .sidebar-app'),button=>{const r=button.getBoundingClientRect(),icons=Array.from(button.querySelectorAll('.group-icon-slot > .app-icon'),icon=>icon.getBoundingClientRect());const left=Math.min(...icons.map(i=>i.left)),right=Math.max(...icons.map(i=>i.right)),top=Math.min(...icons.map(i=>i.top)),bottom=Math.max(...icons.map(i=>i.bottom));return {count:icons.length,width:r.width,height:r.height,dx:(left+right-r.left-r.right)/2,dy:(top+bottom-r.top-r.bottom)/2}})`);
        assert.deepEqual(favorites.map(f=>f.count).sort(), [1,2,3], 'Fixture includes single, paired and three-icon favorites');
        assert(favorites.every(f=>f.width===44 && f.height===40 && Math.abs(f.dx)<.5 && Math.abs(f.dy)<.5), 'Favorite tiles keep a compact size and center their visible icons at '+width+': '+JSON.stringify(favorites));
        const crop = await evaluate(main, `(()=>{const r=document.querySelector('.sidebar-page').getBoundingClientRect(),bottom=document.querySelector('.new-tab-button').getBoundingClientRect().bottom;return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(Math.min(r.height,bottom-r.y+12))}})()`);
        fs.writeFileSync(path.join(out, 'sidebar-polish-' + width + '.png'), (await main.capturePage(crop)).toPNG());
      }
      await evaluate(main, `document.querySelector('.workspace-sidebar').style.width='240px';undefined`);
      await wait(350);
      await click('.folder-heading');
      await click('.sidebar-app[aria-label="Shopping"]');
    }
  }
  await click('.favorites-grid .sidebar-app[aria-label="Pair"]');
  await until(`document.querySelector('.favorites-grid .sidebar-app.active')?.style.getPropertyValue('--website-color').toLowerCase()==='#c0392b'`);
  await wait(160);
  const activeFavoriteBounds = await evaluate(main, `document.querySelector('.favorites-grid .sidebar-app.active').getBoundingClientRect().toJSON()`);
  const redFinish = await evaluate(main, `getComputedStyle(document.querySelector('.favorites-grid .sidebar-app.active')).backgroundImage`);
  const favoriteFinish = await evaluate(main, `(()=>{const s=getComputedStyle(document.querySelector('.favorites-grid .sidebar-app.active')),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');context.fillStyle=s.backgroundColor;context.fillRect(0,0,1,1);return {background:s.backgroundImage,clips:s.backgroundClip,shadow:s.boxShadow,alpha:context.getImageData(0,0,1,1).data[3],active:document.querySelectorAll('.favorites-grid .sidebar-app.active').length}})()`);
  assert(favoriteFinish.alpha===0 && favoriteFinish.background.includes('radial-gradient') && favoriteFinish.background.includes('linear-gradient') && favoriteFinish.clips==='padding-box, padding-box, border-box' && favoriteFinish.shadow.includes('inset') && favoriteFinish.active===1, 'Active favorite uses the website color in a gradient rim, softly rounded face and inner groove, preserved on focus: '+JSON.stringify(favoriteFinish));
  await until(`!!document.querySelector('[data-tab-motion="horizontal-main-favorite-2-1"] .horizontal-tab-select')`);
  await click('[data-tab-motion="horizontal-main-favorite-2-1"] .horizontal-tab-select');
  await until(`document.querySelector('.favorites-grid .sidebar-app.active')?.style.getPropertyValue('--website-color').toLowerCase()==='#568fe0'`);
  assert.notEqual(await evaluate(main, `getComputedStyle(document.querySelector('.favorites-grid .sidebar-app.active')).backgroundImage`), redFinish, 'Switching within a favorite group follows its focused tab color');
  assert.deepEqual(await evaluate(main, `document.querySelector('.favorites-grid .sidebar-app.active').getBoundingClientRect().toJSON()`), activeFavoriteBounds, 'Color and depth do not change tile geometry');
  await evaluate(main, `document.activeElement?.blur();undefined`);
  main.webContents.sendInputEvent({type:'mouseMove', x:1000, y:700});
  await wait(200);
  const favoriteCrop = await evaluate(main, `(()=>{const r=document.querySelector('.favorites-grid').getBoundingClientRect();return {x:Math.floor(r.x)-2,y:Math.floor(r.y)-3,width:Math.ceil(r.width)+4,height:Math.ceil(r.height)+6}})()`);
  fs.writeFileSync(path.join(out, 'favorites-colored.png'), (await main.capturePage(favoriteCrop)).toPNG());
  await evaluate(main, `document.querySelector('.radix-themes').classList.replace('dark','light');undefined`);
  await wait(150);
  fs.writeFileSync(path.join(out, 'favorites-colored-light.png'), (await main.capturePage(favoriteCrop)).toPNG());
  await evaluate(main, `document.querySelector('.radix-themes').classList.replace('light','dark');undefined`);
  await click('.favorites-grid .sidebar-app[aria-label="Stack"]');
  await until(`document.querySelector('.favorites-grid .sidebar-app[aria-label="Stack"]').getAttribute('aria-current')==='page'`);
  assert(await evaluate(main, `(()=>{const button=document.querySelector('.favorites-grid .sidebar-app.active');return !button.style.getPropertyValue('--website-color')&&getComputedStyle(button).getPropertyValue('--favorite-color').trim()===getComputedStyle(document.querySelector('.workspace')).getPropertyValue('--kudium-primary').trim()})()`), 'Pages without a primary color use the space accent');
  console.log('PASS: native space title search, trusted typing, result selection, collapsed collections, unpinned groups, no results, accent and collection matching, narrow layouts, Escape and space reset. Evidence: ' + out);
};
