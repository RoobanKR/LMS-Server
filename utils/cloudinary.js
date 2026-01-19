const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

class CloudinaryService {
  /**
   * Upload screen recording to Cloudinary
   * @param {Buffer} fileBuffer - Video file buffer
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Cloudinary response
   */
  static async uploadScreenRecording(fileBuffer, options = {}) {
    try {
      const uploadOptions = {
        resource_type: 'video',
        folder: options.folder || 'screen-recordings/assessments',
        public_id: options.public_id,
        overwrite: options.overwrite || true,
        transformation: [
          { width: 1280, height: 720, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'mp4' }
        ],
        tags: ['screen-recording', 'assessment', ...(options.tags || [])],
        chunk_size: 6000000, // 6MB chunks
        eager: [
          { width: 640, height: 360, crop: 'scale', format: 'mp4' },
          { width: 320, height: 180, crop: 'scale', format: 'mp4' }
        ],
        eager_async: true,
        context: {
          userId: options.userId,
          exerciseId: options.exerciseId,
          courseId: options.courseId,
          type: 'screen_recording'
        },
        metadata: {
          device_info: options.deviceInfo || '',
          screen_resolution: options.screenResolution || '',
          frame_rate: options.frameRate || 30
        }
      };

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        streamifier.createReadStream(fileBuffer).pipe(uploadStream);
      });
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw error;
    }
  }

  /**
   * Update existing video in Cloudinary
   * @param {String} publicId - Cloudinary public ID
   * @param {Buffer} newFileBuffer - New video file
   * @returns {Promise<Object>} Updated video info
   */
  static async updateScreenRecording(publicId, newFileBuffer) {
    try {
      // Delete old video
      await cloudinary.uploader.destroy(publicId, { 
        resource_type: 'video',
        invalidate: true 
      });

      // Upload new video with same public_id
      return await this.uploadScreenRecording(newFileBuffer, {
        public_id: publicId.split('/').pop(), // Remove folder from public_id
        overwrite: true
      });
    } catch (error) {
      console.error('Cloudinary update error:', error);
      throw error;
    }
  }

  /**
   * Get video details from Cloudinary
   * @param {String} publicId - Cloudinary public ID
   * @returns {Promise<Object>} Video resource details
   */
  static async getVideoDetails(publicId) {
    try {
      return await cloudinary.api.resource(publicId, {
        resource_type: 'video'
      });
    } catch (error) {
      console.error('Cloudinary get details error:', error);
      throw error;
    }
  }

  /**
   * Generate secure URL with transformations
   * @param {String} publicId - Cloudinary public ID
   * @param {Object} transformations - Video transformations
   * @returns {String} Secure URL
   */
  static generateSecureUrl(publicId, transformations = {}) {
    const defaultTransformations = {
      width: transformations.width || 1280,
      height: transformations.height || 720,
      crop: 'limit',
      quality: 'auto',
      fetch_format: 'mp4'
    };

    return cloudinary.url(publicId, {
      resource_type: 'video',
      secure: true,
      transformation: [defaultTransformations],
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiry
    });
  }

  /**
   * Delete video from Cloudinary
   * @param {String} publicId - Cloudinary public ID
   * @returns {Promise<Object>} Delete result
   */
  static async deleteVideo(publicId) {
    try {
      return await cloudinary.uploader.destroy(publicId, {
        resource_type: 'video',
        invalidate: true
      });
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw error;
    }
  }
}

module.exports = CloudinaryService;