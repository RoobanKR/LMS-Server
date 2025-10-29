const User = require("../models/UserModel");
const Otp = require("../models/OTPModel");
const { createSecretToken } = require("../config/secretToken");
const config = require("config");
const BASE_URL = config.get("BASE_URL");
const bcrypt = require("bcryptjs");
const emailUtil = require("../utils/sendEmail");
const jwt = require("jsonwebtoken");
const JWT_TOKEN_KEY = config.get("JWT_TOKEN_KEY");
const otpGenerator = require("otp-generator");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const tokenModal = require("../models/tokenModal");

const { createClient } = require("@supabase/supabase-js");
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseUrl = process.env.SUPABASE_URL;

const supabase = createClient(supabaseUrl, supabaseKey);

exports.Addusers = async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      phone,
      role,
      gender,
      permission,
      password,
      status,
    } = req.body;

    const existingEmployee = await User.findOne({ email });
    if (existingEmployee) {
      return res.status(403).json({
        message: [{ key: "error", value: "User already exists" }],
      });
    }

    let imageUrl;
    const imageFile = req.files?.profile;

    if (imageFile) {
      const uniqueFileName = `${Date.now()}_${imageFile.name}`;
      const { data, error } = await supabase.storage
        .from("smartlms")
        .upload(`users/profile/${uniqueFileName}`, imageFile.data);

      if (error) {
        console.error("Error uploading image to Supabase:", error);
        return res.status(500).json({
          message: [
            { key: "error", value: "Error uploading image to Supabase" },
          ],
        });
      }
      imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/users/profile/${uniqueFileName}`;
    } else {
      const currentDate = new Date();
      const defaultFileName = `default_profile_image_${currentDate.getTime()}.jpg`;
      const { data, error } = await supabase.storage
        .from("smartlms")
        .copy(
          "users/profile/default_profile_image.jpg",
          `users/profile/${defaultFileName}`
        );

      if (error) {
        console.error("Error copying default image in Supabase:", error);
        return res.status(500).json({
          message: [
            { key: "error", value: "Error setting up default profile image" },
          ],
        });
      }
      imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/users/profile/${defaultFileName}`;
    }

    const newUser = await User.create({
      email,
      firstName,
      lastName,
      phone,
      gender,
      password,
      profile: imageUrl,
      role,
      status,
      institution: req.user.institution,
      permission: permission,
      createdBy: req.user.email,
    });

    const token = createSecretToken(newUser._id);

    // Send welcome email
    const emailSubject = "Welcome to smartlms HUB - Your Account Details";
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to the smartlms Dashboard</h2>
        <p>You have been successfully added as a user to our system.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #495057;">Your Account Details:</h3>
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Role:</strong> ${role}</p>
          <p><strong>Temporary Password:</strong> ${password}</p>
        </div>
        
        <p><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.BASE_URL || "http://localhost:3000"}/signin" 
             style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
             Login to Your Account
          </a>
        </div>
        
        <p style="color: #6c757d; font-size: 14px;">
          If you have any questions, please contact your administrator.
        </p>
      </div>
    `;

    const emailSent = await emailUtil.sendEmail(email, emailSubject, emailBody);

    if (emailSent) {
      res.status(201).json({
        message: [{ key: "success", value: "User registered successfully" }],
        user: {
          _id: newUser._id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          institution: newUser.institution,
          permission: newUser.permission,
        },
        token: token,
      });
    } else {
      res.status(201).json({
        message: [
          { key: "success", value: "User registered successfully" },
          {
            key: "warning",
            value: "Email sending failed - please inform user manually",
          },
        ],
        user: {
          _id: newUser._id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          institution: newUser.institution,
        },
        token: token,
      });
    }
  } catch (error) {
    console.error("Error creating user:", error);

    if (error.name === "ValidationError") {
      const errors = Object.keys(error.errors).map((key) => ({
        key,
        value: error.errors[key].message,
      }));
      return res.status(400).json({ message: errors });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        message: [
          { key: "error", value: "User with this email already exists" },
        ],
      });
    }

    res.status(500).json({
      message: [
        { key: "error", value: "Internal server error while creating user" },
      ],
    });
  }
};

// Updated UserSignIn function
module.exports.UserSignIn = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: [{ key: "error", value: "All fields are required" }],
      });
    }

    const user = await User.findOne({ email }).populate('institution');

    if (!user) {
      return res.status(400).json({
        message: [{ key: "error", value: "Email is invalid" }],
      });
    }


    // Check user status - only allow active users to login
    if (user.status !== 'active') {
      let errorMessage = "Account is not active";
      
      if (user.status === 'inactive') {
        errorMessage = "Your account is inactive. Please contact administrator";
      } else if (user.status === 'suspended') {
        errorMessage = "Your account has been suspended. Please contact administrator";
      }
      
      return res.status(403).json({
        message: [{ key: "error", value: errorMessage }],
      });
    }

    // Compare passwords
    const auth = await bcrypt.compare(password, user.password);
    if (!auth) {
      return res.status(400).json({
        message: [{ key: "error", value: "Password is incorrect" }],
      });
    }

    const isFirstTimeLogin = user.firstTimeLoginDone;

    if (isFirstTimeLogin) {
      await User.updateOne({ _id: user._id }, { firstTimeLoginDone: false });
    }

    const token = createSecretToken(user._id, "2d");

    // Store token in separate Token collection
    const newToken = new tokenModal({
      token: token,
    });
    await newToken.save();

    const sanitizedUser = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      firstTimeLoginDone: isFirstTimeLogin,
      institution_id: user.institution._id,
      userId: user._id,
      institutionName: user.institution.inst_name,
    };

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 2 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: [
        { key: "success", value: `${user.role} logged in successfully` },
      ],
      user: sanitizedUser,
      token: token,
      institution: user.institution._id,
      institutionName: user.institution.inst_name,
      userId: user._id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: [{ key: "error", value: "Internal Server Error" }],
    });
  }
};

module.exports.verifyToken = async (req, res, next) => {
  try {
    // Check both cookie and Authorization header
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_TOKEN_KEY);

    // Find user (modify this based on your token storage)
    const user = await User.findOne({ _id: decoded.id });

    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports.UserLogout = async (req, res) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: [{ key: "error", value: "No token provided" }],
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.user._id },
      { $pull: { tokens: { token: token } } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        message: [{ key: "error", value: "User not found" }],
      });
    }

    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });

    return res.status(200).json({
      message: [{ key: "success", value: "Logged out successfully" }],
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      message: [{ key: "error", value: "Internal Server Error" }],
    });
  }
};

module.exports.UserLogoutAll = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.user._id },
      { $set: { tokens: [] } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        message: [{ key: "error", value: "User not found" }],
      });
    }

    // Clear the cookie
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });

    return res.status(200).json({
      message: [
        { key: "success", value: "Logged out from all devices successfully" },
      ],
    });
  } catch (error) {
    console.error("Logout all error:", error);
    return res.status(500).json({
      message: [{ key: "error", value: "Internal Server Error" }],
    });
  }
};

module.exports.UserVerify = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: [{ key: "error", value: "User not found" }],
      });
    }

    const sanitizedUser = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      address: user.address,
      profile: user.profile,
      role: user.role,
      designation: user.designation,
      institution: user.institution,
      permission: user.permission,
    };

    return res.status(200).json({
      user: sanitizedUser,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: [
        { key: "error", value: "Internal Server Error", detail: error.message },
      ],
    });
  }
};

exports.getUserAccess = async (req, res) => {
  try {
    const { instutionId } = req.params; // Get institutionId from path parameters
    
    // Build filter object
    let filter = {};
    if (instutionId && instutionId !== 'all') {
      filter.institution = instutionId;
    }
    
    // Find users based on filter
    const Users = await User.find(filter).populate('institution');
    
    if (!Users || Users.length === 0) {
      const message = instutionId && instutionId !== 'all'
        ? `No users found for institution ID: ${instutionId}`
        : "No users found";
      console.error(message);
      return res.status(404).json({ message });
    }
    
    const successMessage = instutionId && instutionId !== 'all'
      ? `Users retrieved for institution ID: ${instutionId}`
      : "All users retrieved successfully";
    
    res.status(200).json({
      message: [{ key: "success", value: successMessage }],
      Users: Users,
      totalCount: Users.length,
    });
  } catch (error) {
    console.error("Error in getUserAccess:", error);
    res.status(500).json({ 
      message: [{ key: "error", value: "Internal server error" }] 
    });
  }
};
exports.getUserAccessById = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res
        .status(404)
        .json({ message: [{ key: "error", value: "User not found" }] });
    }

    res.status(200).json({
      message: [
        { key: "success", value: "User section Id based get the data" },
      ],
      user: user,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: [{ key: "error", value: "Internal server error" }] });
  }
};

exports.UpdateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      email,
      firstName,
      lastName,
      phone,
      role,
      gender,
      permission,
      status,
    } = req.body;

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        message: [{ key: "error", value: "User not found" }],
      });
    }

    if (email && email !== existingUser.email) {
      const emailExists = await User.findOne({ email, _id: { $ne: userId } });
      if (emailExists) {
        return res.status(403).json({
          message: [{ key: "error", value: "Email already exists" }],
        });
      }
    }

    let imageUrl;
    const imageFile = req.files?.profile;

    if (imageFile) {
      if (
        existingUser.profile &&
        !existingUser.profile.includes("default_profile_image")
      ) {
        try {
          const oldImagePath = existingUser.profile.split("/").pop();
          const { error: deleteError } = await supabase.storage
            .from("smartlms")
            .remove([`users/profile/${oldImagePath}`]);

          if (deleteError) {
            console.error("Error deleting old image:", deleteError);
          }
        } catch (deleteErr) {
          console.error("Error extracting old image path:", deleteErr);
        }
      }

      const uniqueFileName = `${Date.now()}_${imageFile.name}`;
      const { data, error } = await supabase.storage
        .from("smartlms")
        .upload(`users/profile/${uniqueFileName}`, imageFile.data);

      if (error) {
        console.error("Error uploading image to Supabase:", error);
        return res.status(500).json({
          message: [
            { key: "error", value: "Error uploading image to Supabase" },
          ],
        });
      }
      imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/users/profile/${uniqueFileName}`;
    }

    const updateData = {
      ...(email && { email }),
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phone && { phone }),
      ...(gender && { gender }),
      ...(role && { role }),
      ...(status && { status }),
      ...(permission && { permission }),
      ...(imageUrl && { profile: imageUrl }),
      updatedBy: req.user.email,
      updatedAt: new Date(),
    };

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({
        message: [{ key: "error", value: "User not found" }],
      });
    }

    res.status(200).json({
      message: [{ key: "success", value: "User updated successfully" }],
      user: {
        _id: updatedUser._id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        gender: updatedUser.gender,
        role: updatedUser.role,
        institution: updatedUser.institution,
        permission: updatedUser.permission,
        profile: updatedUser.profile,
        updatedAt: updatedUser.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating user:", error);

    if (error.name === "ValidationError") {
      const errors = Object.keys(error.errors).map((key) => ({
        key,
        value: error.errors[key].message,
      }));
      return res.status(400).json({ message: errors });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        message: [
          { key: "error", value: "User with this email already exists" },
        ],
      });
    }

    res.status(500).json({
      message: [
        { key: "error", value: "Internal server error while updating user" },
      ],
    });
  }
};

exports.DeleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        message: [{ key: "error", value: "User not found" }],
      });
    }

    if (existingUser.profile) {
      try {
        const imageUrlParts = existingUser.profile.split("/");
        const imageName = imageUrlParts[imageUrlParts.length - 1];

        const { error: removeError } = await supabase.storage
          .from("smartlms")
          .remove([`users/profile/${imageName}`]);

        if (removeError) {
          console.error("Error removing image from Supabase:", removeError);
          return res.status(500).json({
            message: [
              {
                key: "error",
                value: "Error removing image from Supabase storage",
              },
            ],
          });
        }
      } catch (error) {
        console.error("Error in removing image:", error);
        return res.status(500).json({
          message: [
            {
              key: "error",
              value: "Error removing image from Supabase storage",
            },
          ],
        });
      }
    }
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({
        message: [{ key: "error", value: "User not found" }],
      });
    }

    res.status(200).json({
      message: [{ key: "success", value: "User deleted successfully" }],
      deletedUser: {
        _id: deletedUser._id,
        email: deletedUser.email,
        firstName: deletedUser.firstName,
        lastName: deletedUser.lastName,
      },
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      message: [
        { key: "error", value: "Internal server error while deleting user" },
      ],
    });
  }
};



// Toggle user status between active and inactive
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        message: [{ key: "error", value: "User ID is required" }],
      });
    }

    // Validate status if provided
    if (status && !["active", "inactive"].includes(status)) {
      return res.status(400).json({
        message: [{ key: "error", value: "Status must be either 'active' or 'inactive'" }],
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: [{ key: "error", value: "User not found" }],
      });
    }

    // Toggle status or set to provided status
    const newStatus = status || (user.status === "active" ? "inactive" : "active");
    
    // Update user status
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        status: newStatus,
        updatedAt: new Date(),
        updatedBy: req.user.email,
      },
      { 
        new: true,
        runValidators: true
      }
    ).select("-password -tokens");

    // Send notification email for both activation and deactivation
    const emailSubject = "Account Status Update - smartlms HUB";
    let emailBody;

    if (newStatus === "inactive") {
      emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Account Status Update</h2>
          <p>Hello ${updatedUser.firstName} ${updatedUser.lastName},</p>
          
          <div style="background-color: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <h3 style="color: #856404;">Account Deactivated</h3>
            <p>Your account has been temporarily deactivated. Please contact your administrator if you believe this is an error.</p>
          </div>
          
          <p style="color: #6c757d; font-size: 14px;">
            If you have any questions, please contact your administrator.
          </p>
        </div>
      `;
    } else {
      emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Account Status Update</h2>
          <p>Hello ${updatedUser.firstName} ${updatedUser.lastName},</p>
          
          <div style="background-color: #d4edda; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0;">
            <h3 style="color: #155724;">Account Activated</h3>
            <p>Great news! Your account has been activated and you can now access all features of the smartlms platform.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.BASE_URL || "http://localhost:3000"}/login" 
               style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
               Login to Your Account
            </a>
          </div>
          
          <p style="color: #6c757d; font-size: 14px;">
            If you have any questions, please contact your administrator.
          </p>
        </div>
      `;
    }

    // Send email (don't block the response if email fails)
    emailUtil.sendEmail(updatedUser.email, emailSubject, emailBody)
      .catch(error => console.error("Failed to send status update email:", error));

    res.status(200).json({
      message: [{ 
        key: "success", 
        value: `User status updated to ${newStatus} successfully` 
      }],
      user: {
        _id: updatedUser._id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        status: updatedUser.status,
        institution: updatedUser.institution,
      },
    });

  } catch (error) {
    console.error("Error updating user status:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        message: [{ key: "error", value: "Invalid user ID format" }],
      });
    }

    res.status(500).json({
      message: [{ key: "error", value: "Internal server error while updating user status" }],
    });
  }
};

// Bulk status update for multiple users
exports.bulkToggleUserStatus = async (req, res) => {
  try {
    const { userIds, status } = req.body;

    // Validate input
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        message: [{ key: "error", value: "User IDs array is required" }],
      });
    }

    if (!status || !["active", "inactive"].includes(status)) {
      return res.status(400).json({
        message: [{ key: "error", value: "Status must be either 'active' or 'inactive'" }],
      });
    }

    // Update multiple users
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { 
        status: status,
        updatedAt: new Date(),
        updatedBy: req.user.email
      }
    );

    // Get updated users for response
    const updatedUsers = await User.find(
      { _id: { $in: userIds } }
    ).select("-password -tokens");

    // Send notification emails to all updated users
    const emailSubject = "Account Status Update - smartlms HUB";
    
    const emailPromises = updatedUsers.map(user => {
      let emailBody;
      
      if (status === "inactive") {
        emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Account Status Update</h2>
            <p>Hello ${user.firstName} ${user.lastName},</p>
            
            <div style="background-color: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <h3 style="color: #856404;">Account Deactivated</h3>
              <p>Your account has been temporarily deactivated. Please contact your administrator if you believe this is an error.</p>
            </div>
            
            <p style="color: #6c757d; font-size: 14px;">
              If you have any questions, please contact your administrator.
            </p>
          </div>
        `;
      } else {
        emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Account Status Update</h2>
            <p>Hello ${user.firstName} ${user.lastName},</p>
            
            <div style="background-color: #d4edda; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0;">
              <h3 style="color: #155724;">Account Activated</h3>
              <p>Great news! Your account has been activated and you can now access all features of the smartlms platform.</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.BASE_URL || "http://localhost:3000"}/signin" 
                 style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                 Login to Your Account
              </a>
            </div>
            
            <p style="color: #6c757d; font-size: 14px;">
              If you have any questions, please contact your administrator.
            </p>
          </div>
        `;
      }
      
      return emailUtil.sendEmail(user.email, emailSubject, emailBody)
        .catch(error => console.error(`Failed to send status update email to ${user.email}:`, error));
    });

    // Send all emails (don't block the response if emails fail)
    Promise.all(emailPromises)
      .catch(error => console.error("Some emails failed to send:", error));

    res.status(200).json({
      message: [{ 
        key: "success", 
        value: `${result.modifiedCount} users updated to ${status} successfully` 
      }],
      updatedCount: result.modifiedCount,
      users: updatedUsers.map(user => ({
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      })),
    });

  } catch (error) {
    console.error("Error bulk updating user status:", error);

    res.status(500).json({
      message: [{ key: "error", value: "Internal server error while updating users status" }],
    });
  }
};

