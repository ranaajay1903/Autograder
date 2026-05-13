// File Management Service - Handle code file storage and retrieval
const CodeFile = require('../models/codeFile');
const Submission = require('../models/submission');

class FileService {
  // Save code file to database
  static async saveCodeFile(submissionId, fileName, fileContent) {
    try {
      const fileSizeKB = Buffer.byteLength(fileContent, 'utf8') / 1024;

      const existingFile = await CodeFile.findOne({
        where: { submissionId, fileName }
      });

      if (existingFile) {
        existingFile.fileContent = fileContent;
        existingFile.fileSizeKB = Math.round(fileSizeKB * 100) / 100;
        existingFile.uploadedAt = new Date();
        await existingFile.save();
        return existingFile;
      }

      const codeFile = await CodeFile.create({
        submissionId,
        fileName,
        fileContent,
        fileSizeKB: Math.round(fileSizeKB * 100) / 100,
      });
      
      return codeFile;
    } catch (error) {
      console.error('Error saving code file:', error);
      throw new Error('Failed to save code file to database');
    }
  }

  // Get code file by ID
  static async getCodeFileById(fileId) {
    try {
      const codeFile = await CodeFile.findByPk(fileId);
      if (!codeFile) {
        return null;
      }
      return codeFile;
    } catch (error) {
      console.error('Error fetching code file:', error);
      throw new Error('Failed to fetch code file from database');
    }
  }

  // Get all files for a submission
  static async getSubmissionFiles(submissionId) {
    try {
      const files = await CodeFile.findAll({
        where: { submissionId },
        attributes: ['id', 'fileName', 'uploadedAt', 'fileSizeKB'],
        order: [['uploadedAt', 'DESC']],
      });
      return files;
    } catch (error) {
      console.error('Error fetching submission files:', error);
      throw new Error('Failed to fetch submission files');
    }
  }

  // Delete code file
  static async deleteCodeFile(fileId) {
    try {
      const result = await CodeFile.destroy({
        where: { id: fileId },
      });
      return result > 0;
    } catch (error) {
      console.error('Error deleting code file:', error);
      throw new Error('Failed to delete code file');
    }
  }

  // Get file with content (full file)
  static async getFileWithContent(fileId) {
    try {
      const codeFile = await CodeFile.findByPk(fileId);
      if (!codeFile) {
        return null;
      }
      return {
        id: codeFile.id,
        fileName: codeFile.fileName,
        fileContent: codeFile.fileContent,
        uploadedAt: codeFile.uploadedAt,
        fileSizeKB: codeFile.fileSizeKB,
      };
    } catch (error) {
    }
  }
}

module.exports = FileService;
