const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const subPermissionsSchema = new mongoose.Schema({
  subPermissions: { type: String },
  subPermissionsFunctionality: [{ type: String }],
});

const PermissionSchema = new mongoose.Schema({
  permissions: { type: String },
  permissionFunctionality: { type: [String], default: [] },
  subPermission: { type: [subPermissionsSchema], default: [] },
});

const tokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400,
  },
});

tokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

const userSchema = new mongoose.Schema({
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LMS-Institution",
  },
  email: {
    type: String,
    required: [true, "Your email address is required"],
    unique: true,
    lowercase: true,
    validate: (value) => {
      return validator.isEmail(value);
    },
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    // required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  gender: {
    type: String,
  },
  password: {
    type: String,
    required: [true, "Your password is required"],
  },
  profile: {
    type: String,
  },
  role: {
    type: String,
    required: true,
  },
  permission: PermissionSchema,
  status: {
    type: String,
    enum: ["active", "inactive"],
  },
  createdAt: {
    type: Date,
    default: new Date(),
  },
  createdBy: {
    type: String,
    // required: [true, "createdBy is required"],
  },
  tokens: [tokenSchema],
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("LMS-User", userSchema);
