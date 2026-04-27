import {
  pgTable, pgEnum, text, timestamp, uuid, integer, primaryKey, index, boolean,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ===== Auth.js v5 標準テーブル =====
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (t) => ({
  pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
}));

export const authSessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.identifier, t.token] }),
}));

// ===== アプリ固有テーブル =====
export const sessionStatusEnum = pgEnum('session_status', [
  'uploading', 'processing', 'ready', 'failed',
]);

export const recordingSessions = pgTable('recording_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('無題の録音'),
  status: sessionStatusEnum('status').notNull().default('uploading'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  durationSec: integer('duration_sec').notNull().default(0),
  audioBlobUrl: text('audio_blob_url'),
  audioMimeType: text('audio_mime_type'),
  gainValue: integer('gain_value').notNull().default(1),   // 録音時のゲイン設定を保存
  recordingMode: text('recording_mode').notNull().default('meeting'), // 対面/会議室/講義/web
  // 文字起こし再試行の追跡（成功するまでの累積。成功で 0 にリセット）
  retryCount: integer('retry_count').notNull().default(0),
  lastErrorCategory: text('last_error_category'),
  lastErrorAt: timestamp('last_error_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('rec_sessions_user_idx').on(t.userId, t.startedAt),
}));

export const transcripts = pgTable('transcripts', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull()
    .references(() => recordingSessions.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  speakerLabel: integer('speaker_label').notNull().default(0),
  startMs: integer('start_ms').notNull().default(0),
  endMs: integer('end_ms').notNull().default(0),
  text: text('text').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  sessionIdx: index('transcripts_session_idx').on(t.sessionId, t.seq),
}));

export const speakerMappings = pgTable('speaker_mappings', {
  sessionId: uuid('session_id').notNull()
    .references(() => recordingSessions.id, { onDelete: 'cascade' }),
  speakerLabel: integer('speaker_label').notNull(),
  displayName: text('display_name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.speakerLabel] }),
}));

export const summaries = pgTable('summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().unique()
    .references(() => recordingSessions.id, { onDelete: 'cascade' }),
  markdown: text('markdown').notNull(),
  model: text('model').notNull().default('gemini-2.0-flash'),
  generatedAt: timestamp('generated_at').defaultNow().notNull(),
});

// ===== リレーション =====
export const usersRelations = relations(users, ({ many }) => ({
  recordingSessions: many(recordingSessions),
}));

export const recordingSessionsRelations = relations(recordingSessions, ({ one, many }) => ({
  user: one(users, { fields: [recordingSessions.userId], references: [users.id] }),
  transcripts: many(transcripts),
  speakerMappings: many(speakerMappings),
  summary: one(summaries),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  session: one(recordingSessions, { fields: [transcripts.sessionId], references: [recordingSessions.id] }),
}));

export const speakerMappingsRelations = relations(speakerMappings, ({ one }) => ({
  session: one(recordingSessions, { fields: [speakerMappings.sessionId], references: [recordingSessions.id] }),
}));

export const summariesRelations = relations(summaries, ({ one }) => ({
  session: one(recordingSessions, { fields: [summaries.sessionId], references: [recordingSessions.id] }),
}));
