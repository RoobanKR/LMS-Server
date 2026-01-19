const CourseStructure = require("../../models/Courses/courseStructureModal");
const CourseStructureDynamic = require("../../models/dynamicContent/courseStructureDynamicModal");
const mongoose = require("mongoose");
const { createClient } = require("@supabase/supabase-js");
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseUrl = process.env.SUPABASE_URL;

const supabase = createClient(supabaseUrl, supabaseKey);
const User = require("../../models/UserModel");
const { sendEmail } = require("../../utils/sendEmail");
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


exports.getAllCoursesDataWithoutAINotes = async (req, res) => {
  try {

    // Find the course with participants and complete user data
 const course = await CourseStructure.find({
      institution: req.user.institution,
    }).populate({
        path: 'singleParticipants.user',
        select: '-notes -ai_history -password -tokens -__v -notifications',
        populate: [
          {
            path: 'role',
            select: 'name description'
          },
          {
            path: 'courses.courseId',
            select: 'courseName courseCode description'
          }
        ]
      })
      .lean();

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found"
      });
    }

    // Get complete course progress for all participants
    const participantsWithFullData = await Promise.all(
      course.singleParticipants.map(async (participant) => {
        if (!participant.user) {
          return {
            ...participant,
            user_Data: null
          };
        }

        // Get the complete course progress data for this specific course
        const user = await User.findById(participant.user._id)
          .select('courses')
          .lean();

        // Find the full course progress for this specific course
        const fullCourseProgress = user?.courses?.find(
          course => course.courseId && course.courseId.toString() === course
        );

        // Merge the basic user data with complete course progress
        const userData = {
          ...participant.user,
          courses: fullCourseProgress ? [fullCourseProgress] : []
        };

        // Clean up the data
        const cleanUserData = JSON.parse(JSON.stringify(userData, (key, value) => {
          // Remove unwanted fields
          if (key === 'notes' || key === 'ai_history' || key === 'password' || 
              key === 'tokens' || key === '__v' || key === '$__' || 
              key === '$isNew' || value === undefined) {
            return undefined;
          }
          return value;
        }));

        return {
          _id: participant._id,
          status: participant.status,
          enableEnrolmentDates: participant.enableEnrolmentDates,
          enrolmentStartsDate: participant.enrolmentStartsDate,
          enrolmentEndsDate: participant.enrolmentEndsDate,
          createdAt: participant.createdAt,
          updatedAt: participant.updatedAt,
          user_Data: cleanUserData
        };
      })
    );

    // Fetch course structure components
    const [modules, subModules, topics, subTopics] = await Promise.all([
      Module1.find({ courses: course }).select('-__v -createdAt -updatedAt').lean(),
      SubModule1.find({ moduleId: { $in: await Module1.find({ courses: course }).distinct('_id') } })
        .select('-__v -createdAt -updatedAt').lean(),
      Topic1.find({
        $or: [
          { moduleId: { $in: await Module1.find({ courses: course }).distinct('_id') } },
          { subModuleId: { $in: await SubModule1.find().distinct('_id') } }
        ]
      }).select('-__v -createdAt -updatedAt').lean(),
      SubTopic1.find({ 
        topicId: { $in: await Topic1.find().distinct('_id') } 
      }).select('-__v -createdAt -updatedAt').lean()
    ]);

    // Structure modules with their relationships
    const structuredModules = modules.map(module => {
      const moduleSubModules = subModules.filter(
        sm => sm.moduleId?.toString() === module._id.toString()
      );

      const processedSubModules = moduleSubModules.map(subModule => {
        const subModuleTopics = topics.filter(
          t => t.subModuleId?.toString() === subModule._id.toString()
        );

        const processedTopics = subModuleTopics.map(topic => ({
          ...topic,
          subTopics: subTopics.filter(
            st => st.topicId?.toString() === topic._id.toString()
          )
        }));

        return {
          ...subModule,
          topics: processedTopics
        };
      });

      const moduleDirectTopics = topics.filter(
        t =>
          t.moduleId?.toString() === module._id.toString() &&
          (!t.subModuleId || !moduleSubModules.some(sm => sm._id.toString() === t.subModuleId?.toString()))
      );

      const processedDirectTopics = moduleDirectTopics.map(topic => ({
        ...topic,
        subTopics: subTopics.filter(
          st => st.topicId?.toString() === topic._id.toString()
        )
      }));

      return {
        ...module,
        subModules: processedSubModules,
        topics: processedDirectTopics
      };
    });

    // Construct final response
    const responseData = {
      _id: course._id,
      courseName: course.courseName,
      courseCode: course.courseCode,
      description: course.description,
      singleParticipants: participantsWithFullData,
      modules: structuredModules,
      meta: {
        participantsCount: participantsWithFullData.length,
        modulesCount: modules.length,
        subModulesCount: subModules.length,
        topicsCount: topics.length,
        subTopicsCount: subTopics.length
      }
    };

    res.status(200).json({
      success: true,
      data: responseData,
      message: "Course data with complete user progress fetched successfully"
    });

  } catch (error) {
    console.error("Error fetching course structure:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
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

exports.singleAddParticipants = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { participantIds, enrollmentData = {} } = req.body;

    // Validate input
    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid participant IDs'
      });
    }

    // Validate ObjectIds
    const validParticipantIds = participantIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validParticipantIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid participant IDs provided'
      });
    }

    // Find the course
    const course = await CourseStructure.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Find all valid participants
    const participants = await User.find({
      _id: { $in: validParticipantIds }
    });

    if (participants.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid participants found'
      });
    }

    // Prepare enrollment data for each participant
    const enrollmentToAdd = [];
    const notificationsToSend = [];
    const emailsToSend = [];
    
    for (const participant of participants) {
      // Check if participant already exists in the course
      const existingEnrollment = course.singleParticipants.find(
        enrollment => enrollment.user.toString() === participant._id.toString()
      );

      if (!existingEnrollment) {
        // Prepare enrollment object
        enrollmentToAdd.push({
          user: participant._id,
          status: enrollmentData.status || 'active',
          enableEnrolmentDates: false,
          enrolmentStartsDate: null,
          enrolmentEndsDate: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        // Prepare notification for user
        const notification = {
          title: 'New Course Enrollment',
          message: `You have been enrolled in the course "${course.courseName}"`,
          type: 'success',
          relatedEntity: 'enrollment',
          relatedEntityId: courseId,
          enrolledBy: req.user?.id,
          metadata: new Map([
            ['Course Name',   course.courseName],
            ['Course Code',   course.courseCode],
            ['Enrollment Date',   new Date().toISOString()],
          ]),
        };

        notificationsToSend.push({
          userId: participant._id,
          notification: notification
        });

        // Prepare email for ALL users
        emailsToSend.push({
          email: participant.email,
          name: `${participant.firstName} ${participant.lastName || ''}`.trim(),
          courseName: course.courseName,
          courseCode: course.courseCode,
          enrollmentDate: new Date().toLocaleDateString(),
          institutionId: course.institution,
          userId: participant._id, // Store user ID for reference
          user: participant // Store the user object
        });
      }
    }

    if (enrollmentToAdd.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All selected participants are already enrolled in the course',
        data: course
      });
    }

    // Add new participants to the course
    course.singleParticipants.push(...enrollmentToAdd);
    course.updatedAt = new Date();
    course.updatedBy = req.user?.id || 'system';

    await course.save();

    // Add notifications to users' profiles
    const notificationPromises = notificationsToSend.map(async ({ userId, notification }) => {
      try {
        const user = await User.findById(userId);
        if (user) {
          await user.addNotification(notification);
        }
      } catch (error) {
        console.error(`Failed to add notification for user ${userId}:`, error);
      }
    });

    await Promise.all(notificationPromises);

    
    // Check if emails should be sent
 if (emailsToSend.length > 0) {
  const emailPromises = emailsToSend.map(async (emailData) => {
    try {
      
      const emailSubject = `Enrollment Confirmation: ${emailData.courseName}`;
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50;">Course Enrollment Confirmation</h2>
          <p>Dear ${emailData.name},</p>
          <p>You have been successfully enrolled in the following course:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">${emailData.courseName}</h3>
            <p><strong>Course Code:</strong> ${emailData.courseCode}</p>
            <p><strong>Enrollment Date:</strong> ${emailData.enrollmentDate}</p>
          </div>
          <p>You can access the course material by logging into your LMS account.</p>
          <p>If you have any questions, please contact your course instructor or system administrator.</p>
          <br>
          <p>Best regards,<br>LMS Team</p>
        </div>
      `;

      // Send the email using your existing function
      const emailSent = await sendEmail(
        [emailData.email],  // to
        emailSubject,       // subject
        emailBody,          // body
        []                  // cc (empty array)
      );

      return { success: emailSent };
    } catch (error) {
      console.error(`Failed to send email to ${emailData.email}:`, error);
      return { success: false, error: error.message };
    }
  });
      // Send emails in background (don't wait for completion)
      Promise.all(emailPromises)
        .then(results => {
          const successful = results.filter(r => r && r.success).length;
          const failed = results.filter(r => !r || !r.success).length;
          
          // Log details for debugging
          results.forEach((result, index) => {
            if (!result || !result.success) {
              console.error(`Failed to send email to ${emailsToSend[index]?.email}:`, result?.error || 'Unknown error');
            }
          });
        })
        .catch(error => {
          console.error('Error in email sending process:', error);
        });
    } else {
    }

    // Populate user details for response
    const populatedCourse = await CourseStructure.findById(courseId)
      .populate({
        path: 'singleParticipants.user',
        select: 'firstName lastName email phone role status degree department year semester batch gender profile createdAt'
      });

    // Also populate user details with notifications count
    const enrolledUsers = await User.find({
      _id: { $in: enrollmentToAdd.map(e => e.user) }
    }).select('firstName lastName email notifications unreadNotificationCount');

    res.status(200).json({
      success: true,
      message: `${enrollmentToAdd.length} participant(s) added successfully`,
      data: {
        course: populatedCourse,
        addedParticipants: enrolledUsers.map(user => ({
          id: user._id,
          name: `${user.firstName} ${user.lastName || ''}`.trim(),
          email: user.email,
          notificationsCount: user.unreadNotificationCount
        })),
        notificationsSent: notificationsToSend.length,
        emailsSent: emailsToSend.length
      }
    });

  } catch (error) {
    console.error('Error adding participants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add participants',
      error: error.message
    });
  }
};
exports.updateParticipantEnrollment = async (req, res) => {
  try {
    const { courseId, participantId } = req.params;
    const { status, enableEnrolmentDates, enrolmentStartsDate, enrolmentEndsDate } = req.body;

    // Validate at least one field is provided
    if (!status && enableEnrolmentDates === undefined && !enrolmentStartsDate && !enrolmentEndsDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one field to update'
      });
    }

    // Find the course
    const course = await CourseStructure.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Find the participant enrollment
    const enrollmentIndex = course.singleParticipants.findIndex(
      enrollment => enrollment.user.toString() === participantId
    );

    if (enrollmentIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found in this course'
      });
    }

    // Update enrollment fields
    const enrollment = course.singleParticipants[enrollmentIndex];
    
    if (status) {
      enrollment.status = status;
    }
    
    // Handle enableEnrolmentDates
    if (enableEnrolmentDates !== undefined) {
      enrollment.enableEnrolmentDates = enableEnrolmentDates;
      
      if (enableEnrolmentDates === false) {
        // If disabling dates, set them to null
        enrollment.enrolmentStartsDate = null;
        enrollment.enrolmentEndsDate = null;
      } else if (enableEnrolmentDates === true) {
        // If enabling dates, use provided dates or set to current date
        if (enrolmentStartsDate) {
          enrollment.enrolmentStartsDate = new Date(enrolmentStartsDate);
        } else if (!enrollment.enrolmentStartsDate) {
          // Set to current date if not already set
          enrollment.enrolmentStartsDate = new Date();
        }
        
        // Set end date based on start date + default duration (365 days)
        if (enrolmentEndsDate) {
          enrollment.enrolmentEndsDate = new Date(enrolmentEndsDate);
        } else if (enrollment.enrolmentStartsDate && !enrollment.enrolmentEndsDate) {
          const endDate = new Date(enrollment.enrolmentStartsDate);
          endDate.setDate(endDate.getDate() + 365); // Default 1 year
          enrollment.enrolmentEndsDate = endDate;
        }
      }
    }
    
    // Update specific dates if provided (only when dates are enabled)
    if (enrollment.enableEnrolmentDates === true) {
      if (enrolmentStartsDate) {
        enrollment.enrolmentStartsDate = new Date(enrolmentStartsDate);
      }
      
      if (enrolmentEndsDate) {
        enrollment.enrolmentEndsDate = new Date(enrolmentEndsDate);
      }
      
      // Ensure end date is after start date
      if (enrollment.enrolmentStartsDate && enrollment.enrolmentEndsDate) {
        if (enrollment.enrolmentEndsDate < enrollment.enrolmentStartsDate) {
          return res.status(400).json({
            success: false,
            message: 'End date must be after start date'
          });
        }
      }
    }
    
    enrollment.updatedAt = new Date();

    // Save the updated course
    course.updatedAt = new Date();
    course.updatedBy = req.user?.id || 'system';
    await course.save();

    // Populate user details for response
    const populatedCourse = await CourseStructure.findById(courseId)
      .populate({
        path: 'singleParticipants.user',
        select: 'firstName lastName email phone role status degree department year semester batch gender profile createdAt'
      });

    res.status(200).json({
      success: true,
      message: 'Enrollment updated successfully',
      data: populatedCourse
    });

  } catch (error) {
    console.error('Error updating enrollment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update enrollment',
      error: error.message
    });
  }
};


// Backend API - Remove participant from course
exports.deleteAddParticipants = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Find the course
    const course = await CourseStructure.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if course has singleParticipants array
    if (!course.singleParticipants || !Array.isArray(course.singleParticipants)) {
      return res.status(404).json({
        success: false,
        message: 'No participants found in this course'
      });
    }

    // Find the participant to be removed
    let participantToRemove = null;
    let participantId = null;
    
    // Find the participant in singleParticipants
    for (const enrollment of course.singleParticipants) {
      // Handle both cases: enrollment object with user field or direct user ID
      if (enrollment.user && enrollment.user.toString() === userId) {
        participantToRemove = enrollment;
        participantId = enrollment.user.toString();
        break;
      } else if (enrollment.toString() === userId) {
        participantId = enrollment.toString();
        break;
      }
    }

    if (!participantId) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found in this course'
      });
    }

    // Get participant details before removal - DON'T use .select() to preserve schema methods
    const participant = await User.findById(participantId);
    // Alternative: Use lean() if you need specific fields but still want to call methods
    // const participant = await User.findById(participantId).lean();

    if (!participant) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove the participant from singleParticipants
    const initialLength = course.singleParticipants.length;
    
    // For new schema (array of objects)
    course.singleParticipants = course.singleParticipants.filter(
      enrollment => {
        // Handle both cases: enrollment object with user field or direct user ID
        if (enrollment.user) {
          return enrollment.user.toString() !== userId;
        } else {
          return enrollment.toString() !== userId;
        }
      }
    );

    if (course.singleParticipants.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Participant not found in this course'
      });
    }

    // Update course
    course.updatedAt = new Date();
    course.updatedBy = req.user?.id || 'system';
    
    await course.save();

    // Send notification to the removed user
    let notificationSent = false;
    let notificationError = null;
    
    try {
      const notification = {
        title: 'Course Enrollment Removed',
        message: `You have been removed from the course "${course.courseName}"`,
        type: 'warning',
        relatedEntity: 'enrollment',
        relatedEntityId: courseId,
        removedBy: req.user?.email,
        metadata: new Map([
          ['Course Name', course.courseName],
          ['Course Code', course.courseCode],
          ['Removal Date', new Date().toISOString()],
          ['Removed By', req.user?.email || 'system'],
        ]),
      };

      // Check if the participant object has the addNotification method
      if (typeof participant.addNotification === 'function') {
        await participant.addNotification(notification);
        notificationSent = true;
      } else {
    
        const updatedUser = await User.findByIdAndUpdate(
          participantId,
          {
            $push: {
              notifications: {
                $each: [{
                  title: notification.title,
                  message: notification.message,
                  type: notification.type,
                  relatedEntity: notification.relatedEntity,
                  relatedEntityId: notification.relatedEntityId,
                  read: false,
                  createdAt: new Date()
                }],
                $position: 0
              }
            },
            $inc: { unreadNotificationCount: 1 }
          },
          { new: true }
        );
        
        if (updatedUser) {
          notificationSent = true;
        }
      }
    } catch (error) {
      notificationError = error.message;
      console.error(`Failed to send notification to user ${participantId}:`, error);
      // Don't fail the whole operation if notification fails
    }

    // Send email to the removed user
    let emailSent = false;
    let emailError = null;
    
    try {
      const emailSubject = `Course Enrollment Removed: ${course.courseName}`;
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50;">Course Enrollment Update</h2>
          <p>Dear ${participant.firstName} ${participant.lastName || ''},</p>
          <p>Your enrollment in the following course has been removed:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #e74c3c;">
            <h3 style="margin-top: 0; color: #e74c3c;">${course.courseName}</h3>
            <p><strong>Course Code:</strong> ${course.courseCode}</p>
            <p><strong>Removal Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Removed By:</strong> ${req.user?.email ? 'System Administrator' : 'System'}</p>
          </div>
          <p>If you believe this is an error or have any questions, please contact your course instructor or system administrator.</p>
          <p>You will no longer have access to the course material through your LMS account.</p>
          <br>
          <p>Best regards,<br>LMS Team</p>
        </div>
      `;

      // Send the email using your existing function
      const emailResult = await sendEmail(
        [participant.email],  // to
        emailSubject,         // subject
        emailBody,            // body
        []                    // cc (empty array)
      );

      emailSent = emailResult ? true : false;
    } catch (error) {
      emailError = error.message;
      console.error(`Failed to send email to ${participant.email}:`, error);
      // Don't fail the whole operation if email fails
    }

    // Return success response with updated course
    const updatedCourse = await CourseStructure.findById(courseId)
      .populate({
        path: 'singleParticipants.user',
        select: 'firstName lastName email phone role status'
      });

    res.status(200).json({
      success: true,
      message: 'Participant removed successfully',
      data: {
        course: updatedCourse,
        removedParticipant: {
          id: participant._id,
          name: `${participant.firstName} ${participant.lastName || ''}`.trim(),
          email: participant.email,
          removedAt: new Date(),
          removedBy: req.user?.email || 'system'
        },
        notification: {
          sent: notificationSent,
          error: notificationError
        },
        email: {
          sent: emailSent,
          error: emailError
        }
      }
    });

  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove participant',
      error: error.message
    });
  }
};

exports.deleteMultipleParticipants = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { participantIds } = req.body;

    // Validate input
    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'participantIds must be a non-empty array'
      });
    }

    // Validate ObjectIds
    const validParticipantIds = participantIds.filter(id => 
      mongoose.Types.ObjectId.isValid(id)
    );

    if (validParticipantIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid participant IDs provided'
      });
    }

    // Find course
    const course = await CourseStructure.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if course has singleParticipants
    if (!course.singleParticipants || !Array.isArray(course.singleParticipants)) {
      return res.status(404).json({
        success: false,
        message: 'No participants found in this course'
      });
    }

    // Get all participants to be removed
    const participantsToRemove = await User.find({
      _id: { $in: validParticipantIds }
    }).select('_id firstName lastName email');

    if (participantsToRemove.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid users found with the provided IDs'
      });
    }

    const participantMap = new Map();
    participantsToRemove.forEach(participant => {
      participantMap.set(participant._id.toString(), participant);
    });

    const initialCount = course.singleParticipants.length;
    let removedCount = 0;
    const removedParticipants = [];
    const removedParticipantIds = [];

    // Check schema type by examining first item
    const firstItem = course.singleParticipants[0];
    
    if (firstItem && typeof firstItem === 'object' && firstItem.user) {
      // New schema: array of objects with user field
      course.singleParticipants = course.singleParticipants.filter(enrollment => {
        if (enrollment.user && validParticipantIds.includes(enrollment.user.toString())) {
          const participantId = enrollment.user.toString();
          const participant = participantMap.get(participantId);
          if (participant) {
            removedParticipants.push(participant);
            removedParticipantIds.push(participantId);
          }
          removedCount++;
          return false; // Remove this enrollment
        }
        return true; // Keep this enrollment
      });
    } else {
      // Old schema: array of ObjectIds
      course.singleParticipants = course.singleParticipants.filter(participantId => {
        const idStr = participantId.toString();
        if (validParticipantIds.includes(idStr)) {
          const participant = participantMap.get(idStr);
          if (participant) {
            removedParticipants.push(participant);
            removedParticipantIds.push(idStr);
          }
          removedCount++;
          return false; // Remove this participant
        }
        return true; // Keep this participant
      });
    }

    if (removedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No matching participants found in this course'
      });
    }

    // Update metadata
    course.updatedAt = new Date();
    course.updatedBy = req.user?.id || 'system';

    await course.save();

    // Send notifications to all removed users
    const notificationResults = [];
    const notificationPromises = removedParticipants.map(async (participant) => {
      try {
        const notification = {
          title: 'Course Enrollment Removed',
          message: `You have been removed from the course "${course.courseName}"`,
          type: 'warning',
          relatedEntity: 'enrollment',
          relatedEntityId: courseId,
          removedBy: req.user?.email,
          metadata: new Map([
            ['Course Name', course.courseName],
            ['Course Code', course.courseCode],
            ['Removal Date', new Date().toISOString()],
            ['Removed By', req.user?.email || 'system'],
          ]),
        };

        // Get full user document to ensure methods are available
        const userDoc = await User.findById(participant._id);
        
        if (userDoc && typeof userDoc.addNotification === 'function') {
          await userDoc.addNotification(notification);
          notificationResults.push({
            userId: participant._id,
            success: true,
            email: participant.email
          });
        } else {
          // Fallback: Update notifications directly
          await User.findByIdAndUpdate(
            participant._id,
            {
              $push: {
                notifications: {
                  $each: [{
                    title: notification.title,
                    message: notification.message,
                    type: notification.type,
                    relatedEntity: notification.relatedEntity,
                    relatedEntityId: notification.relatedEntityId,
                    read: false,
                    createdAt: new Date()
                  }],
                  $position: 0
                }
              },
              $inc: { unreadNotificationCount: 1 }
            }
          );
          notificationResults.push({
            userId: participant._id,
            success: true,
            email: participant.email,
            method: 'fallback'
          });
        }
      } catch (error) {
        console.error(`Failed to send notification to user ${participant._id}:`, error);
        notificationResults.push({
          userId: participant._id,
          success: false,
          email: participant.email,
          error: error.message
        });
      }
    });

    await Promise.all(notificationPromises);

    // Send emails to all removed users
    const emailResults = [];
    const emailPromises = removedParticipants.map(async (participant) => {
      try {
        const emailSubject = `Course Enrollment Removed: ${course.courseName}`;
        const emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50;">Course Enrollment Update</h2>
            <p>Dear ${participant.firstName} ${participant.lastName || ''},</p>
            <p>Your enrollment in the following course has been removed:</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #e74c3c;">
              <h3 style="margin-top: 0; color: #e74c3c;">${course.courseName}</h3>
              <p><strong>Course Code:</strong> ${course.courseCode}</p>
              <p><strong>Removal Date:</strong> ${new Date().toLocaleDateString()}</p>
              <p><strong>Removed By:</strong> ${req.user?.email ? 'System Administrator' : 'System'}</p>
            </div>
            <p>If you believe this is an error or have any questions, please contact your course instructor or system administrator.</p>
            <p>You will no longer have access to the course material through your LMS account.</p>
            <br>
            <p>Best regards,<br>LMS Team</p>
          </div>
        `;

        const emailSent = await sendEmail(
          [participant.email],
          emailSubject,
          emailBody,
          []
        );

        emailResults.push({
          userId: participant._id,
          email: participant.email,
          success: emailSent ? true : false
        });

      } catch (error) {
        console.error(`Failed to send email to ${participant.email}:`, error);
        emailResults.push({
          userId: participant._id,
          email: participant.email,
          success: false,
          error: error.message
        });
      }
    });

    // Send emails in background (don't wait for completion)
    Promise.all(emailPromises)
      .then(results => {
        const successfulEmails = results.filter(r => r && r.success).length;
        const failedEmails = results.filter(r => !r || !r.success).length;
      })
      .catch(error => {
        console.error('Error in email sending process:', error);
      });

    // Populate the response with user data
    const updatedCourse = await CourseStructure.findById(courseId)
      .populate({
        path: 'singleParticipants.user',
        select: 'firstName lastName email'
      });

    // Calculate statistics
    const successfulNotifications = notificationResults.filter(r => r.success).length;
    const failedNotifications = notificationResults.filter(r => !r.success).length;
    
    const successfulEmails = emailResults.filter(r => r.success).length;
    const failedEmails = emailResults.filter(r => !r.success).length;

    res.status(200).json({
      success: true,
      message: `${removedCount} participant(s) removed successfully`,
      data: {
        course: updatedCourse,
        removalSummary: {
          totalRemoved: removedCount,
          removedParticipants: removedParticipants.map(p => ({
            id: p._id,
            name: `${p.firstName} ${p.lastName || ''}`.trim(),
            email: p.email
          })),
          removedAt: new Date(),
          removedBy: req.user?.id || 'system'
        },
        notifications: {
          total: notificationResults.length,
          successful: successfulNotifications,
          failed: failedNotifications,
          details: notificationResults
        },
        emails: {
          total: emailResults.length,
          successful: successfulEmails,
          failed: failedEmails,
          details: emailResults
        }
      }
    });

  } catch (error) {
    console.error('Error removing participants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove participants',
      error: error.message
    });
  }
};