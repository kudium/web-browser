import { connect } from "../src/db";
import { marketplaceStore } from "../src/hook-marketplace";
import { hookImageStore, imageRoot } from "../src/hook-images";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const { db, client } = connect(process.env.DATABASE_URL);
try {
  const count = await hookImageStore(imageRoot()).cleanup((key) =>
    marketplaceStore(db).imageReferenced(key),
  );
  console.log("Removed unreferenced screenshots:", count);
} finally {
  await client.end();
}
