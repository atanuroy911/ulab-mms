import mongoose, { Schema, Document, Model } from 'mongoose';

export type UserRole = 'admin' | 'coordinator' | 'teacher';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  googleId?: string | null;
  /** @deprecated Superseded by `roles`. Kept in sync (mirrors 'admin' <-> roles.includes('admin'))
   *  for the one remaining reader (app/api/auth/users/route.ts) until that's migrated too. */
  role?: 'user' | 'admin';
  roles: UserRole[];
  departmentId?: mongoose.Types.ObjectId | null;
  /** Department codes (Department.code) a coordinator has authority over. Only meaningful
   *  when `roles` includes 'coordinator'. */
  coordinatorDepartments?: string[];
  passwordResetToken?: string | null;
  passwordResetTokenExpiry?: Date | null;
  /** True for a placeholder account created by a capstone invite (lib/userInvites.ts) that
   *  the person hasn't activated yet. It can be assigned as supervisor/evaluator but has no
   *  way to sign in until they set a password or link Google. */
  invitePending?: boolean;
  inviteTokenHash?: string | null;
  inviteTokenExpiry?: Date | null;
  invitedBy?: mongoose.Types.ObjectId | null;
  /** The single "Web Admin" record that stands in for the /admin panel's built-in login in
   *  audit fields (lib/webAdminAccount.ts). Can't sign in, is hidden from people pickers,
   *  and can never be a supervisor or evaluator. */
  systemAccount?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
    },
    password: {
      type: String,
      // Accounts created/linked via Google sign-in have no password.
      // Invited placeholder accounts have neither until the person activates the invite.
      required: [
        function (this: IUser) { return !this.googleId && !this.invitePending && !this.systemAccount; },
        'Please provide a password',
      ],
      minlength: [6, 'Password should be at least 6 characters'],
    },
    googleId: {
      type: String,
      // No `default: null`. A sparse unique index skips documents that LACK the field but
      // still indexes an explicit null - so defaulting to null let only one non-Google
      // account exist, and the next invite/sign-up failed with E11000 on googleId_1.
      // Accounts without Google must simply not have the field.
      unique: true,
      sparse: true,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetTokenExpiry: {
      type: Date,
      default: null,
    },
    invitePending: {
      type: Boolean,
      default: false,
    },
    inviteTokenHash: {
      type: String,
      default: null,
    },
    inviteTokenExpiry: {
      type: Date,
      default: null,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    systemAccount: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    roles: {
      type: [String],
      enum: ['admin', 'coordinator', 'teacher'],
      default: ['teacher'],
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    coordinatorDepartments: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Keep the legacy scalar `role` in sync with `roles` on every save, so the one remaining
// reader of `role` (app/api/auth/users/route.ts) sees an admin-role grant/revoke immediately
// without every write path needing to remember to set both fields.
UserSchema.pre('save', function (this: IUser, next) {
  if (this.isModified('roles')) {
    this.role = this.roles?.includes('admin') ? 'admin' : 'user';
  }
  next();
});

// Force re-registration with the latest schema on every load, so a long-running
// dev server can't keep using a stale cached model that silently strips newer
// fields (e.g. googleId) from writes instead of erroring.
if (mongoose.models.User) {
  delete mongoose.models.User;
}

const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);

export default User;
