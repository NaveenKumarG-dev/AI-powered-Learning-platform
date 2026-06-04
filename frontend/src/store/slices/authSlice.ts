import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authAPI, userAPI } from '../../services/api';
import { parseError, parseErrors } from '../../utils/errorHandler';
import {
  User,
  LearningProfile,
  LoginCredentials,
  RegisterData,
  AuthResponse,
  ApiError,
} from '../../types/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | ApiError | null;
}

const initialState: AuthState = {
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  accessToken: localStorage.getItem('access_token'),
  refreshToken: localStorage.getItem('refresh_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),
  loading: false,
  error: null,
};

// Async thunks
export const register = createAsyncThunk(
  'auth/register',
  async (data: RegisterData, { rejectWithValue }) => {
    try {
      const response = await authAPI.register(data);
      return response;
    } catch (error: any) {
      const parsed = parseError(error);
      // Return both the parsed error and the raw details for better UX
      return rejectWithValue({
        message: parsed.message,
        errorCode: parsed.errorCode,
        details: parsed.details,
        isNetworkError: parsed.isNetworkError,
        isTimeoutError: parsed.isTimeoutError,
      });
    }
  }
);

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await authAPI.login(credentials);
      return response;
    } catch (error: any) {
      const parsed = parseError(error);
      // Return both the parsed error and the raw details for better UX
      return rejectWithValue({
        message: parsed.message,
        errorCode: parsed.errorCode,
        details: parsed.details,
        isNetworkError: parsed.isNetworkError,
        isTimeoutError: parsed.isTimeoutError,
      });
    }
  }
);

export const logout = createAsyncThunk('auth/logout', async (_, { getState }) => {
  const state = getState() as { auth: AuthState };
  if (state.auth.refreshToken) {
    try {
      await authAPI.logout(state.auth.refreshToken);
    } catch (error) {
      // Ignore logout errors
    }
  }
});

export const fetchUserProfile = createAsyncThunk('auth/fetchUserProfile', async (_, { rejectWithValue }) => {
  try {
    const user = await userAPI.getProfile();
    return user;
  } catch (error: any) {
    const parsed = parseError(error);
    return rejectWithValue({
      message: parsed.message,
      errorCode: parsed.errorCode,
      details: parsed.details,
    });
  }
});

export const updateUserProfile = createAsyncThunk(
  'auth/updateUserProfile',
  async (data: Partial<User>, { rejectWithValue }) => {
    try {
      const user = await userAPI.updateProfile(data);
      return user;
    } catch (error: any) {
      const parsed = parseError(error);
      return rejectWithValue({
        message: parsed.message,
        errorCode: parsed.errorCode,
        details: parsed.details,
      });
    }
  }
);

export const updateLearningProfile = createAsyncThunk(
  'auth/updateLearningProfile',
  async (data: Partial<LearningProfile>, { rejectWithValue }) => {
    try {
      const profile = await userAPI.updateLearningProfile(data);
      return profile;
    } catch (error: any) {
      const parsed = parseError(error);
      return rejectWithValue({
        message: parsed.message,
        errorCode: parsed.errorCode,
        details: parsed.details,
      });
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setTokens: (state, action: PayloadAction<{ access: string; refresh: string }>) => {
      state.accessToken = action.payload.access;
      state.refreshToken = action.payload.refresh;
      state.isAuthenticated = true;
      localStorage.setItem('access_token', action.payload.access);
      localStorage.setItem('refresh_token', action.payload.refresh);
    },
  },
  extraReducers: (builder) => {
    // Register
    builder
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action: PayloadAction<AuthResponse>) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.access;
        state.refreshToken = action.payload.refresh;
        state.isAuthenticated = true;
        localStorage.setItem('user', JSON.stringify(action.payload.user));
        localStorage.setItem('access_token', action.payload.access);
        localStorage.setItem('refresh_token', action.payload.refresh);
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string | ApiError) || (action.error?.message as string) || 'An error occurred during registration.';
      });

    // Login
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<AuthResponse>) => {
        state.loading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.access;
        state.refreshToken = action.payload.refresh;
        state.isAuthenticated = true;
        localStorage.setItem('user', JSON.stringify(action.payload.user));
        localStorage.setItem('access_token', action.payload.access);
        localStorage.setItem('refresh_token', action.payload.refresh);
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string | ApiError) || (action.error?.message as string) || 'An error occurred during login.';
      });

    // Logout
    builder.addCase(logout.fulfilled, (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      localStorage.removeItem('user');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    });

    // Fetch user profile
    builder
      .addCase(fetchUserProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUserProfile.fulfilled, (state, action: PayloadAction<User>) => {
        state.loading = false;
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string | ApiError) || (action.error?.message as string) || 'Failed to fetch user profile.';
      });

    // Update user profile
    builder
      .addCase(updateUserProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateUserProfile.fulfilled, (state, action: PayloadAction<User>) => {
        state.loading = false;
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string | ApiError) || (action.error?.message as string) || 'Failed to update profile.';
      });

    // Update learning profile
    builder
      .addCase(updateLearningProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateLearningProfile.fulfilled, (state, action: PayloadAction<LearningProfile>) => {
        state.loading = false;
        if (state.user) {
          state.user.learning_profile = action.payload;
          localStorage.setItem('user', JSON.stringify(state.user));
        }
      })
      .addCase(updateLearningProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string | ApiError) || (action.error?.message as string) || 'Failed to update preferences.';
      });
  },
});

export const { clearError, setTokens } = authSlice.actions;
export default authSlice.reducer;
