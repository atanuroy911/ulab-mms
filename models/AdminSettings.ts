import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAdminSettings extends Document {
  passwordHash: string;
  username: string; // Always 'admin'
  credentialsLoginEnabled: boolean; // Whether teachers can sign in/up with email+password
  courseCodeEditableByTeacher: boolean; // Whether teachers can edit a course's New/UNESCO code (aliasEnabled/alternateCode)
  /** Developer setting: accept any email domain for teacher accounts (sign-up, sign-in,
   *  invites) instead of only @ulab.edu.bd. For testing only - see lib/authSettings.ts. */
  devAllowAnyEmailDomain: boolean;
  /** Developer setting: specific non-ULAB addresses allowed to use the STUDENT Google sign-ins
   *  (portal, marks, attendance check-in, project) for testing. An allowlist, not "any
   *  domain", because students are identified by the ID in their Google display name - which
   *  any outside account can set. See lib/authSettings.ts isAllowedStudentEmail. */
  devStudentTestEmails: string[];
  devSettingsUpdatedBy?: mongoose.Types.ObjectId | null;
  devSettingsUpdatedAt?: Date | null;
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
    devAllowAnyEmailDomain: {
      type: Boolean,
      default: false,
    },
    devStudentTestEmails: {
      type: [String],
      default: [],
    },
    devSettingsUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    devSettingsUpdatedAt: {
      type: Date,
      default: null,
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
