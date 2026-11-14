// Local development fixtures. Existing hooks are never changed.
import { desc, eq, sql } from 'drizzle-orm';
import { connect } from '../src/db';
import { authUser, hookListings, hookLikes } from '../src/schema';
import { marketplaceStore } from '../src/hook-marketplace';
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Sample hooks require a localhost database');
const { db, client } = connect(url.href);
try {
  const ownerId = process.argv.find(arg => arg.startsWith('--owner='))?.slice(8);
  const [owner] = await db.select().from(authUser).where(ownerId ? eq(authUser.id, ownerId) : sql`${authUser.id} not like 'local-hook-sample-voter-%'`).orderBy(desc(authUser.createdAt)).limit(1);
  if (!owner) throw new Error('Create a local account first, or supply --owner=<local-account-id>');
  const samples = [
    { name: 'Comfortable reading', description: 'Larger article text and generous line spacing for a calmer read.', css: 'article p, main p { font-size: 18px !important; line-height: 1.85 !important; }', likes: 8 },
    { name: 'Highlight links', description: 'Give links a clear underline and a familiar blue accent.', css: 'a[href] { color: #007aff !important; text-decoration: underline !important; text-underline-offset: 3px !important; }', likes: 12 },
    { name: 'Reduce motion', description: 'Tone down decorative animations and smooth scrolling across websites.', css: '*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }', likes: 5 },
    { name: 'GitHub reading width', description: 'Keep GitHub README content at a comfortable reading width.', host: 'github.com', css: '.markdown-body { max-width: 760px; margin-inline: auto; line-height: 1.8; }', likes: 10 },
    { name: 'Page ready', description: 'A minimal lifecycle script to experiment with: log when a page finishes loading.', after: "log('Page ready');", likes: 2 },
    { name: 'Show page title', description: 'A simple context-menu action that displays the current page title.', actions: [{id:'show-title',name:'Show page title',contexts:['page'],source:'api.showResult(context.title);'}], likes: 4 },
  ];
  const store = marketplaceStore(db);
  for (const [index, sample] of samples.entries()) {
    const id = `f1000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    if ((await db.select({id:hookListings.id}).from(hookListings).where(eq(hookListings.statusReason,`local-sample:${id}`))).length) continue;
    // Publish through the regular syntax and package validators first.
    const result = await store.publish(owner.id, {
      schemaVersion:sample.actions ? 2 : 1, minimumBrowserVersion:'1.0.0', name:sample.name, description:sample.description,
      license:'MIT', applicability:sample.host ? 'site' : 'general',
      sites:sample.host ? [{host:sample.host,includeSubdomains:true}] : [], path:'/*',
      testUrl:sample.host ? `https://${sample.host}` : 'https://example.com',
      lifecycle:{before:'',after:sample.after || '',css:sample.css || ''},
      ...(sample.actions ? {actions:sample.actions} : {}),
    });
    await db.transaction(async tx => {
      // A fixture marker makes repeat runs skip existing samples.
      const publishedId = result.id;
      for (let n=0;n<sample.likes;n++) {
        const voter = `local-hook-sample-voter-${n}`;
        await tx.insert(authUser).values({id:voter,name:`Sample reader ${n+1}`,email:`hook-reader-${n}@example.invalid`}).onConflictDoNothing();
        await tx.insert(hookLikes).values({hookId:publishedId,userId:voter}).onConflictDoNothing();
      }
      await tx.update(hookListings).set({likes:sample.likes,publishedAt:new Date(Date.now() - (samples.length-index)*86400000),statusReason:`local-sample:${id}`}).where(eq(hookListings.id,publishedId));
    });
    console.log(`Added ${sample.name}: http://localhost:3000/hooks/${result.id}`);
  }
} finally { await client.end(); }
