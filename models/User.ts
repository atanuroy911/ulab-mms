import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  googleId?: string | null;
  role?: 'user' | 'admin';
  passwordResetToken?: string | null;
  passwordResetTokenExpiry?: Date | null;
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
      required: [function (this: IUser) { return !this.googleId; }, 'Please provide a password'],
      minlength: [6, 'Password should be at least 6 characters'],
    },
    googleId: {
      type: String,
      default: null,
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
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
  },
  {
    timestamps: true,
  }
);

// Force re-registration with the latest schema on every load, so a long-running
// dev server can't keep using a stale cached model that silently strips newer
// fields (e.g. googleId) from writes instead of erroring.
if (mongoose.models.User) {
  delete mongoose.models.User;
}

const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);

export default User;
