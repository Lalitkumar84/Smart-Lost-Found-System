"use strict";

require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

function validateConfig() {
  if (!process.env.MONGODB_URI || !JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("Set MONGODB_URI and a JWT_SECRET of at least 32 characters.");
  }
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

let dbConnection;
async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
  if (!dbConnection) {
    dbConnection = mongoose.connect(process.env.MONGODB_URI).catch((error) => {
      dbConnection = null;
      throw error;
    });
  }
  await dbConnection;
}

app.use("/api", async (req, res, next) => {
  try {
    validateConfig();
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true }
}, { timestamps: true });

const itemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: "", maxlength: 2000 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  type: { type: String, required: true, enum: ["lost", "found"] },
  location: { type: String, required: true, trim: true, maxlength: 200 },
  date: { type: String, required: true },
  image: { type: String, default: "", maxlength: 1500000 },
  status: { type: String, enum: ["Active", "Resolved"], default: "Active" },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Item = mongoose.model("Item", itemSchema);

function createToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Please log in to do that." });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Your login has expired. Please log in again." });
  }
}

function optionalAuth(req, res, next) {
  const authorization = req.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      // Public item browsing continues when a stored token has expired.
    }
  }
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Name must be between 2 and 80 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ message: "Password must be between 8 and 72 characters." });
    if (await User.exists({ email })) return res.status(409).json({ message: "An account with this email already exists." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    res.status(201).json({ token: createToken(user), user: { name: user.name, email: user.email } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Email or password is incorrect." });
    }
    res.json({ token: createToken(user), user: { name: user.name, email: user.email } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/items", optionalAuth, async (req, res, next) => {
  try {
    const query = {};
    if (["lost", "found"].includes(req.query.type)) query.type = req.query.type;
    if (req.query.category) query.category = String(req.query.category).slice(0, 60);
    if (req.query.status === "Resolved") {
      if (!req.user) return res.json([]);
      query.status = "Resolved";
      query.reportedBy = req.user.sub;
    } else {
      query.status = "Active";
    }
    if (req.query.location) query.location = { $regex: String(req.query.location).slice(0, 100), $options: "i" };
    if (req.query.q) {
      const keyword = String(req.query.q).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [{ title: { $regex: keyword, $options: "i" } }, { description: { $regex: keyword, $options: "i" } }];
    }
    const items = await Item.find(query).sort({ createdAt: -1 }).limit(100).lean();
    res.json(items.map((item) => ({
      ...item,
      id: item._id.toString(),
      isOwner: Boolean(req.user && req.user.sub === item.reportedBy.toString()),
      _id: undefined,
      reportedBy: undefined
    })));
  } catch (error) {
    next(error);
  }
});

app.get("/api/my/items", requireAuth, async (req, res, next) => {
  try {
    const items = await Item.find({ reportedBy: req.user.sub }).sort({ createdAt: -1 }).lean();
    res.json(items.map((item) => ({ ...item, id: item._id.toString(), _id: undefined, reportedBy: undefined })));
  } catch (error) {
    next(error);
  }
});

app.post("/api/items", requireAuth, async (req, res, next) => {
  try {
    const type = String(req.body.type || "");
    const title = String(req.body.title || "").trim();
    const category = String(req.body.category || "").trim();
    const location = String(req.body.location || "").trim();
    const date = String(req.body.date || "");
    const description = String(req.body.description || "").trim();
    const image = String(req.body.image || "");

    if (!["lost", "found"].includes(type)) return res.status(400).json({ message: "Choose lost or found." });
    if (!title || title.length > 120) return res.status(400).json({ message: "Item name is required and must be under 120 characters." });
    if (!category || category.length > 60) return res.status(400).json({ message: "Choose a valid category." });
    if (!location || location.length > 200) return res.status(400).json({ message: "Location is required and must be under 200 characters." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return res.status(400).json({ message: "Enter a valid date." });
    if (description.length > 2000) return res.status(400).json({ message: "Description must be under 2,000 characters." });
    if (image && (!image.startsWith("data:image/") || image.length > 1500000)) return res.status(400).json({ message: "Use an image smaller than 1 MB." });

    const item = await Item.create({ title, category, location, date, description, image, type, reportedBy: req.user.sub });
    res.status(201).json({ ...item.toObject(), id: item._id.toString(), _id: undefined, reportedBy: undefined });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/items/:id/status", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid report ID." });
    const status = String(req.body.status || "");
    if (!["Active", "Resolved"].includes(status)) return res.status(400).json({ message: "Choose Active or Resolved." });

    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, reportedBy: req.user.sub },
      { $set: { status } },
      { new: true, runValidators: true }
    ).lean();
    if (!item) return res.status(404).json({ message: "Report not found or you do not own it." });
    res.json({ ...item, id: item._id.toString(), _id: undefined, reportedBy: undefined });
  } catch (error) {
    next(error);
  }
});

app.post("/api/items/:id/resolve", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid report ID." });
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, status: "Active" },
      { $set: { status: "Resolved", resolvedBy: req.user.sub } },
      { new: true, runValidators: true }
    ).lean();
    if (!item) return res.status(404).json({ message: "This report is already resolved or no longer available." });
    res.json({ ...item, id: item._id.toString(), _id: undefined, reportedBy: undefined, resolvedBy: undefined });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/items/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid report ID." });
    const item = await Item.findOneAndDelete({ _id: req.params.id, reportedBy: req.user.sub });
    if (!item) return res.status(404).json({ message: "Report not found or you do not own it." });
    res.json({ message: "Report deleted." });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (req, res) => res.status(404).json({ message: "API route not found." }));
app.use((error, req, res, next) => {
  console.error(error);
  if (error instanceof mongoose.Error.ValidationError) return res.status(400).json({ message: "Please check the item details and try again." });
  if (error.type === "entity.too.large") return res.status(413).json({ message: "Request too large. Choose an image under 1 MB." });
  res.status(500).json({ message: "Something went wrong on the server." });
});

async function start() {
  try {
    validateConfig();
    await connectDatabase();
    console.log("Connected to MongoDB");
    app.listen(PORT, "0.0.0.0", () => console.log(`FindIt is running at http://localhost:${PORT}`));
  } catch (error) {
    console.error("Could not connect to MongoDB. Check MONGODB_URI in .env.", error.message);
    process.exit(1);
  }
}

module.exports = app;

if (!process.env.VERCEL) {
  start();
}
