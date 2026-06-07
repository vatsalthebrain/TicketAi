import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config();

import User from "./models/user.js";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.log("Usage: node create-admin.js <email> <password>");
  console.log("Example: node create-admin.js admin@example.com mysecurepassword");
  process.exit(1);
}

async function createAdmin() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      console.log(`User ${email} already exists. Updating password and ensuring admin role...`);
      const hashedPassword = await bcrypt.hash(password, 10);
      user.role = "admin";
      user.password = hashedPassword;
      await user.save();
      console.log(`✅ User ${email} has been updated with the new password and confirmed as admin.`);
    } else {
      console.log(`Creating new admin user: ${email}...`);
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await User.create({
        email,
        password: hashedPassword,
        role: "admin",
      });
      console.log(`✅ Admin user ${email} created successfully.`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin user:", error.message);
    process.exit(1);
  }
}

createAdmin();
