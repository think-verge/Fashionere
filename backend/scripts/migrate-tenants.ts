import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import { Tenant } from "../src/models/Tenant.js";

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected.");

  const usersWithoutTenant = await User.find({
    $or: [{ tenant_id: { $exists: false } }, { tenant_id: null }],
  });

  console.log(`Found ${usersWithoutTenant.length} users without a tenant.`);

  let migratedCount = 0;

  for (const user of usersWithoutTenant) {
    const baseSlug = (user.name || user.email.split("@")[0] || "tenant")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 30);
    const uniqueSlug = `${baseSlug}-${user._id.toString().slice(-6)}`;

    let tenant = await Tenant.findOne({ owner_id: user._id });
    if (!tenant) {
      tenant = await Tenant.create({
        name: `${user.name || "My"}'s Organization`,
        slug: uniqueSlug,
        owner_id: user._id,
        plan: "standard",
        status: "active",
        shopify_connected: false,
      });
      console.log(`Created new Tenant ${tenant.name} (${tenant._id}) for user ${user.email}`);
    } else {
      console.log(`Found existing Tenant ${tenant.name} (${tenant._id}) for user ${user.email}`);
    }

    user.tenant_id = tenant._id;
    await user.save();
    migratedCount++;
  }

  console.log(`Successfully migrated ${migratedCount} users.`);
  await mongoose.disconnect();
  console.log("Finished migration and disconnected.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
