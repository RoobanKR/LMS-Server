const CourseStructure = require("../../models/Courses/courseStructureModal");
const CourseStructureDynamic = require("../../models/dynamicContent/courseStructureDynamicModal");
const mongoose = require("mongoose");
const { createClient } = require("@supabase/supabase-js");
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseUrl = process.env.SUPABASE_URL;

const supabase = createClient(supabaseUrl, supabaseKey);

exports.createCourseStructure = async (req, res) => {
  try {
    const {
      clientName,
      serviceType,
      serviceModal,
      category,
      courseCode,
      courseName,
      courseDescription,
      courseDuration,
      courseLevel,
      resourcesType,
      courseHierarchy,
      I_Do,
      We_Do,
      You_Do,
    } = req.body;

    // Check if courseCode already exists
    const existingCourse = await CourseStructure.findOne({ courseCode });
    if (existingCourse) {
      return res.status(403).json({
        message: [{ key: "error", value: "Course Code already exists" }],
      });
    }

    // Required fields check
    if (
      !clientName ||
      !serviceType ||
      !serviceModal ||
      !category ||
      !courseName
    ) {
      return res.status(400).json({
        message: [{ key: "error", value: "Required fields are missing" }],
      });
    }

    // Validate if clientName is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(clientName)) {
      return res.status(400).json({
        message: [{ key: "error", value: "Invalid client ID format" }],
      });
    }

    // Check if the client exists in Course-Structure-Dynamic
    const dynamicStructure = await CourseStructureDynamic.findOne({
      "client._id": clientName,
      institution: req.user.institution,
    });

    if (!dynamicStructure) {
      return res.status(404).json({
        message: [{ key: "error", value: "Client not found in the system" }],
      });
    }

    // Image upload (completely optional - no default image will be set)
    let imageUrl = undefined;
    const imageFile = req.files?.courseImage;

    if (imageFile) {
      const uniqueFileName = `${Date.now()}_${imageFile.name}`;
      const { error } = await supabase.storage
        .from("smartlms")
        .upload(`course/image/${uniqueFileName}`, imageFile.data);

      if (error) {
        console.error("Error uploading image to Supabase:", error);
        return res.status(500).json({
          message: [
            { key: "error", value: "Error uploading image to Supabase" },
          ],
        });
      }

      imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/course/image/${uniqueFileName}`;
    }

    // Save course
    const newCourse = new CourseStructure({
      institution: req.user.institution,
      clientName,
      serviceType,
      serviceModal,
      category,
      courseCode,
      courseName,
      courseDescription,
      courseDuration,
      courseLevel,
      resourcesType,
      courseHierarchy,
      I_Do,
      We_Do,
      You_Do,
      courseImage: imageUrl, // will be undefined if no image was uploaded
      createdBy: req.user.email,
    });

    const savedCourse = await newCourse.save();

    return res.status(201).json({
      message: [
        { key: "success", value: "Course structure created successfully" },
      ],
      data: savedCourse,
    });
  } catch (error) {
    console.error("Error adding course structure:", error);
    return res.status(500).json({
      message: [
        { key: "error", value: "Server error while adding course structure" },
      ],
    });
  }
};

exports.getCourseStructure = async (req, res) => {
  try {
    const courseStructures = await CourseStructure.find({
      institution: req.user.institution,
    });

    // Manually populate client data from Course-Structure-Dynamic
    const populatedCourses = await Promise.all(
      courseStructures.map(async (course) => {
        const dynamicStructure = await CourseStructureDynamic.findOne({
          "client._id": course.clientName,
        });

        if (dynamicStructure) {
          const client = dynamicStructure.client.find(
            (client) => client._id.toString() === course.clientName.toString()
          );

          // Create a new object with modified clientName
          const courseObj = course.toObject();

          return {
            ...courseObj,
            clientName: client ? client.clientCompany : courseObj.clientName,
            clientData: client,
          };
        }

        return course.toObject();
      })
    );

    return res.status(200).json({
      message: [
        { key: "success", value: "Course structures retrieved successfully" },
      ],
      data: populatedCourses,
    });
  } catch (error) {
    console.error("Error fetching course structures:", error);
    return res.status(500).json({
      message: [
        {
          key: "error",
          value: "Server error while fetching course structures",
        },
      ],
    });
  }
};

exports.getCourseStructureById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: [{ key: "error", value: "Invalid course ID format" }],
      });
    }

    const courseStructure = await CourseStructure.findOne({
      _id: id,
      institution: req.user.institution,
    });

    if (!courseStructure) {
      return res.status(404).json({
        message: [{ key: "error", value: "Course structure not found" }],
      });
    }

    // Manually populate client data
    const dynamicStructure = await CourseStructureDynamic.findOne({
      "client._id": courseStructure.clientName,
    });

    let populatedCourse = courseStructure.toObject();

    if (dynamicStructure) {
      const client = dynamicStructure.client.find(
        (client) =>
          client._id.toString() === courseStructure.clientName.toString()
      );

      if (client) {
        populatedCourse = {
          ...populatedCourse,
          clientId: populatedCourse.clientName,
          clientName: client.clientCompany,
          clientData: client,
        };
      }
    }

    return res.status(200).json({
      message: [
        { key: "success", value: "Course structure retrieved successfully" },
      ],
      data: populatedCourse,
    });
  } catch (error) {
    console.error("Error fetching course structure by ID:", error);
    return res.status(500).json({
      message: [
        { key: "error", value: "Server error while fetching course structure" },
      ],
    });
  }
};

exports.updateCourseStructure = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      clientName,
      serviceType,
      serviceModal,
      category,
      courseCode,
      courseName,
      courseDescription,
      courseDuration,
      courseLevel,
      resourcesType,
      courseHierarchy,
      I_Do,
      We_Do,
      You_Do,
      removeImage,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: [{ key: "error", value: "Invalid course ID format" }],
      });
    }

    const existingCourse = await CourseStructure.findOne({
      _id: id,
      institution: req.user.institution,
    });

    if (!existingCourse) {
      return res.status(404).json({
        message: [{ key: "error", value: "Course structure not found" }],
      });
    }

    // Check if courseCode already exists (only if it's being changed)
    if (courseCode && courseCode !== existingCourse.courseCode) {
      const duplicateCourse = await CourseStructure.findOne({
        courseCode,
        _id: { $ne: id },
      });

      if (duplicateCourse) {
        return res.status(403).json({
          message: [{ key: "error", value: "Course Code already exists" }],
        });
      }
    }

    // Validate clientName if provided
    if (clientName) {
      if (!mongoose.Types.ObjectId.isValid(clientName)) {
        return res.status(400).json({
          message: [{ key: "error", value: "Invalid client ID format" }],
        });
      }

      const dynamicStructure = await CourseStructureDynamic.findOne({
        "client._id": clientName,
        institution: req.user.institution,
      });

      if (!dynamicStructure) {
        return res.status(404).json({
          message: [{ key: "error", value: "Client not found in the system" }],
        });
      }
    }

    // Handle image operations
    let imageUrl;
    const imageFile = req.files?.courseImage;

    // If removeImage flag is true, we'll remove the existing image
    if (removeImage === "true" && existingCourse.courseImage) {
      try {
        const oldImagePath = existingCourse.courseImage.split("/").pop();
        const { error: deleteError } = await supabase.storage
          .from("smartlms")
          .remove([`course/image/${oldImagePath}`]);

        if (deleteError) {
          console.error("Error deleting old image:", deleteError);
        }
        imageUrl = undefined;
      } catch (deleteErr) {
        console.error("Error deleting image:", deleteErr);
      }
    }
    // If a new image is uploaded
    else if (imageFile) {
      // Delete old image if it exists
      if (existingCourse.courseImage) {
        try {
          const oldImagePath = existingCourse.courseImage.split("/").pop();
          const { error: deleteError } = await supabase.storage
            .from("smartlms")
            .remove([`course/image/${oldImagePath}`]);

          if (deleteError) {
            console.error("Error deleting old image:", deleteError);
          }
        } catch (deleteErr) {
          console.error("Error deleting old image:", deleteErr);
        }
      }

      // Upload new image
      const uniqueFileName = `${Date.now()}_${imageFile.name}`;
      const { error } = await supabase.storage
        .from("smartlms")
        .upload(`course/image/${uniqueFileName}`, imageFile.data);

      if (error) {
        console.error("Error uploading image to Supabase:", error);
        return res.status(500).json({
          message: [
            { key: "error", value: "Error uploading image to Supabase" },
          ],
        });
      }
      imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/smartlms/course/image/${uniqueFileName}`;
    }

    // Prepare update data
    const updateData = {
      updatedAt: new Date(),
      updatedBy: req.user.email,
    };

    // Build the $set object dynamically
    const setData = {};
    
    // Only add fields that are explicitly provided in the request
    if (clientName !== undefined) setData.clientName = clientName;
    if (serviceType !== undefined) setData.serviceType = serviceType;
    if (serviceModal !== undefined) setData.serviceModal = serviceModal;
    if (category !== undefined) setData.category = category;
    if (courseCode !== undefined) setData.courseCode = courseCode;
    if (courseName !== undefined) setData.courseName = courseName;
    if (courseDescription !== undefined) setData.courseDescription = courseDescription;
    if (courseDuration !== undefined) setData.courseDuration = courseDuration;
    if (courseLevel !== undefined) setData.courseLevel = courseLevel;
    if (resourcesType !== undefined) setData.resourcesType = resourcesType;
    if (courseHierarchy !== undefined) setData.courseHierarchy = courseHierarchy;
    if (I_Do !== undefined) setData.I_Do = I_Do;
    if (We_Do !== undefined) setData.We_Do = We_Do;
    if (You_Do !== undefined) setData.You_Do = You_Do;

    // Handle image updates
    if (removeImage === "true") {
      setData.courseImage = undefined;
    } else if (imageUrl) {
      setData.courseImage = imageUrl;
    } else if (!imageFile && !removeImage) {
      // If no image operation is performed, preserve existing image
      setData.courseImage = existingCourse.courseImage;
    }

    // Use $set to only update the specified fields
    updateData.$set = setData;

    // For array fields that are not provided, we need to explicitly remove them
    const unsetData = {};
    
    // Remove array fields that are not provided in the request
    if (I_Do === undefined) unsetData.I_Do = 1;
    if (We_Do === undefined) unsetData.We_Do = 1;
    if (You_Do === undefined) unsetData.You_Do = 1;
    if (resourcesType === undefined) unsetData.resourcesType = 1;
    if (courseHierarchy === undefined) unsetData.courseHierarchy = 1;

    // Only add $unset if there are fields to remove
    if (Object.keys(unsetData).length > 0) {
      updateData.$unset = unsetData;
    }

    // Update the course
    const updatedCourse = await CourseStructure.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    // Populate client data for response
    const dynamicStructure = await CourseStructureDynamic.findOne({
      "client._id": updatedCourse.clientName,
    });

    let populatedCourse = updatedCourse.toObject();

    if (dynamicStructure) {
      const client = dynamicStructure.client.find(
        (client) =>
          client._id.toString() === updatedCourse.clientName.toString()
      );

      if (client) {
        populatedCourse = {
          ...populatedCourse,
          clientId: populatedCourse.clientName,
          clientName: client.clientCompany,
          clientData: client,
        };
      }
    }


    return res.status(200).json({
      message: [
        { key: "success", value: "Course structure updated successfully" },
      ],
      data: populatedCourse,
    });
  } catch (error) {
    console.error("Error updating course structure:", error);
    return res.status(500).json({
      message: [
        { key: "error", value: "Server error while updating course structure" },
      ],
    });
  }
};

exports.deleteCourseStructure = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate if ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: [{ key: "error", value: "Invalid course ID format" }],
      });
    }

    // Find the existing course
    const existingCourse = await CourseStructure.findOne({
      _id: id,
      institution: req.user.institution,
    });

    if (!existingCourse) {
      return res.status(404).json({
        message: [{ key: "error", value: "Course structure not found" }],
      });
    }

    // Delete the associated image from Supabase (if it's not a default image)
    if (
      existingCourse.courseImage &&
      !existingCourse.courseImage.includes("default_profile_image")
    ) {
      try {
        const imagePath = existingCourse.courseImage.split("/").pop();
        const { error: deleteError } = await supabase.storage
          .from("smartlms")
          .remove([`course/image/${imagePath}`]);

        if (deleteError) {
          console.error("Error deleting image from Supabase:", deleteError);
          // Don't return error here, continue with course deletion
        }
      } catch (deleteErr) {
        console.error("Error extracting image path for deletion:", deleteErr);
        // Don't return error here, continue with course deletion
      }
    }

    // Delete the course from database
    await CourseStructure.findByIdAndDelete(id);

    return res.status(200).json({
      message: [
        { key: "success", value: "Course structure deleted successfully" },
      ],
    });
  } catch (error) {
    console.error("Error deleting course structure:", error);
    return res.status(500).json({
      message: [
        { key: "error", value: "Server error while deleting course structure" },
      ],
    });
  }
};
