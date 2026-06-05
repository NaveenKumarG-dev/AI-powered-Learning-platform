import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { progressAPI, achievementAPI, activityAPI } from '../../services/api';
import { ModuleProgress, UserAchievement, ActivityLog } from '../../types/api';

interface ProgressState {
  moduleProgress: ModuleProgress[];
  achievements: UserAchievement[];
  activityLogs: ActivityLog[];
  loading: boolean;
  error: string | null;
}

const initialState: ProgressState = {
  moduleProgress: [],
  achievements: [],
  activityLogs: [],
  loading: false,
  error: null,
};

// Async thunks
export const fetchModuleProgress = createAsyncThunk(
  'progress/fetchModuleProgress',
  async (params: any, { rejectWithValue }) => {
    try {
      const response = await progressAPI.getModuleProgress(params);
      return response.results;
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to fetch progress');
    }
  }
);

export const updateModuleProgress = createAsyncThunk(
  'progress/updateModuleProgress',
  async ({ id, data }: { id: string | number; data: Partial<ModuleProgress> }, { rejectWithValue }) => {
    try {
      const progress = await progressAPI.updateModuleProgress(id, data);
      return progress;
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to update progress');
    }
  }
);

export const fetchUserAchievements = createAsyncThunk(
  'progress/fetchUserAchievements',
  async (_, { rejectWithValue }) => {
    try {
      const response = await achievementAPI.getUserAchievements();
      return response.results;
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to fetch achievements');
    }
  }
);

export const fetchActivityLogs = createAsyncThunk(
  'progress/fetchActivityLogs',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      const response = await activityAPI.list(params);
      return response.results;
    } catch (error: any) {
      return rejectWithValue(error.response?.data || 'Failed to fetch activity logs');
    }
  }
);

const progressSlice = createSlice({
  name: 'progress',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch module progress
    builder
      .addCase(fetchModuleProgress.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchModuleProgress.fulfilled, (state, action: PayloadAction<ModuleProgress[]>) => {
        state.loading = false;
        state.moduleProgress = action.payload;
      })
      .addCase(fetchModuleProgress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Update module progress
    builder
      .addCase(updateModuleProgress.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateModuleProgress.fulfilled, (state, action: PayloadAction<ModuleProgress>) => {
        state.loading = false;
        const index = state.moduleProgress.findIndex((p) => p.id === action.payload.id);
        if (index !== -1) {
          state.moduleProgress[index] = action.payload;
        }
      })
      .addCase(updateModuleProgress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch user achievements
    builder
      .addCase(fetchUserAchievements.pending, (state) => {
        state.loading = true;
      })
      .addCase(
        fetchUserAchievements.fulfilled,
        (state, action: PayloadAction<UserAchievement[]>) => {
          state.loading = false;
          state.achievements = action.payload;
        }
      )
      .addCase(fetchUserAchievements.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Fetch activity logs
    builder
      .addCase(fetchActivityLogs.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchActivityLogs.fulfilled, (state, action: PayloadAction<ActivityLog[]>) => {
        state.loading = false;
        state.activityLogs = action.payload;
      })
      .addCase(fetchActivityLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError } = progressSlice.actions;
export default progressSlice.reducer;
