// Code File Model - Stores actual code files in database
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CodeFile = sequelize.define('CodeFile', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  submissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  fileName: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  fileContent: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  fileSizeKB: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  uploadedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'code_files',
  timestamps: false,
});

module.exports = CodeFile;
