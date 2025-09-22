import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Name is required"],
    trim: true,
    minlength: [2, "Name must be at least 2 characters long"],
  },
  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      "Please enter a valid email",
    ],
  },
  password: {
    type: String,
    required: [true, "Password is required"],
    minlength: [6, "Password must be at least 6 characters long"],
  },
  gender: {
    type: String,
    required: [true, "Gender is required"],
    enum: ["male", "female"],
  },
  // User preferences and settings
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    rsvpReminders: {
      type: Boolean,
      default: true,
    },
    guestPhotoUploads: {
      type: Boolean,
      default: true,
    },
    publicGallery: {
      type: Boolean,
      default: true,
    },
    guestListAccess: {
      type: Boolean,
      default: false,
    },
    budgetSharing: {
      type: Boolean,
      default: false,
    },
    theme: {
      type: String,
      enum: ["light", "dark", "auto"],
      default: "light",
    },
    language: {
      type: String,
      default: "en",
    },
  },
  // Profile information
  profile: {
    phone: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
    },
    avatar: {
      type: String,
    },
    location: {
      type: String,
      trim: true,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update updatedAt field before saving
userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

const User = mongoose.model("User", userSchema);

export default User;
