require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { getConfiguredAdminEmail } = require("../utils/adminIdentity");

const NEW_PASSWORD = process.argv[2];

function replaceEnvValue(contents, name, value) {
  const lines = contents.split(/\r?\n/);
  const prefix = `${name}=`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) lines[index] = `${prefix}${value}`;
  else lines.push(`${prefix}${value}`);
  return `${lines.filter((line, i) => i < lines.length - 1 || line !== "").join("\n")}\n`;
}

(async () => {
  if (!NEW_PASSWORD || NEW_PASSWORD.length < 12) {
    throw new Error(
      "Pass a password of at least 12 characters as the first argument.",
    );
  }
  const adminEmail = getConfiguredAdminEmail();
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");
  const existingAdmin = await users.findOne({ role: "admin" });
  if (existingAdmin && existingAdmin.email !== adminEmail) {
    throw new Error(
      "Configured ADMIN_EMAIL does not match the existing Admin record.",
    );
  }
  const hash = await bcrypt.hash(NEW_PASSWORD, 12);
  const envPath = path.resolve(__dirname, "..", ".env");
  const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  fs.writeFileSync(envPath, replaceEnvValue(env, "ADMIN_PASSWORD_HASH", hash), {
    mode: 0o600,
  });
  if (existingAdmin) {
    await users.updateOne(
      { _id: existingAdmin._id },
      { $unset: { password: "" } },
    );
  }
  console.log("Admin password updated for", adminEmail);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
