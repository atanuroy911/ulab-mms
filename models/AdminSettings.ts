import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAdminSettings extends Document {
  passwordHash: string;
  username: string; // Always 'admin'
  credentialsLoginEnabled: boolean; // Whether teachers can sign in/up with email+password
  courseCodeEditableByTeacher: boolean; // Whether teachers can edit a course's New/UNESCO code (aliasEnabled/alternateCode)
  createdAt: Date;
  updatedAt: Date;
}

const AdminSettingsSchema: Schema = new Schema(
  {
    username: {
      type: String,
      required: true,
      default: 'admin',
    },
    passwordHash: {
      type: String,
      required: false, // Not required initially - will prompt to set on first login
    },
    credentialsLoginEnabled: {
      type: Boolean,
      default: true,
    },
    courseCodeEditableByTeacher: {
      type: Boolean,
      default: true, // Matches the alias/New Code feature's pre-existing always-editable behavior
    },
  },
  {
    timestamps: true,
  }
);

// Force re-registration with the latest schema on every load, so a long-running
// dev server can't keep using a stale cached model that silently strips newer
// fields (e.g. credentialsLoginEnabled) from writes instead of erroring.
if (mongoose.models.AdminSettings) {
  delete mongoose.models.AdminSettings;
}

const AdminSettings: Model<IAdminSettings> = mongoose.model<IAdminSettings>('AdminSettings', AdminSettingsSchema);

export default AdminSettings;
