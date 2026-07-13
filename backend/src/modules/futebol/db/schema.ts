import {
  pgSchema,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export type FootballSkills = Record<string, number>;
export type FootballTeams = unknown;
export type FootballPositions = string[];

export const futebolSchema = pgSchema('futebol');

export const footballUsers = futebolSchema.table('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const footballPlayers = futebolSchema.table(
  'players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => footballUsers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    position: varchar('position', { length: 100 }).notNull(),
    foot: varchar('foot', { length: 20 }).default('direito').notNull(),
    color: varchar('color', { length: 20 }).default('#22c55e').notNull(),
    photo: text('photo'),
    age: integer('age'),
    height: integer('height'),
    weight: integer('weight'),
    skills: jsonb('skills').$type<FootballSkills>().notNull(),
    positions: jsonb('positions').$type<FootballPositions>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_futebol_players_user').on(table.userId),
  }),
);

export const footballMatches = futebolSchema.table(
  'matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => footballUsers.id, { onDelete: 'cascade' }),
    date: varchar('date', { length: 20 }).notNull(),
    teams: jsonb('teams').$type<FootballTeams>().notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_futebol_matches_user').on(table.userId),
    userDateIdx: index('idx_futebol_matches_user_date').on(table.userId, table.date),
  }),
);

export const footballConfirmations = futebolSchema.table(
  'confirmations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => footballUsers.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id').notNull(),
    gameDate: varchar('game_date', { length: 20 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_futebol_confirmations_user').on(table.userId),
    playerDateUnique: uniqueIndex('idx_futebol_confirmations_player_date_unique').on(
      table.playerId,
      table.gameDate,
    ),
  }),
);

export const footballSchedules = futebolSchema.table(
  'schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => footballUsers.id, { onDelete: 'cascade' }),
    active: boolean('active').default(true).notNull(),
    dayOfWeek: integer('day_of_week').notNull(),
    hour: integer('hour').notNull(),
    minute: integer('minute').notNull(),
    drawType: varchar('draw_type', { length: 30 }).default('balanced').notNull(),
    teamSize: integer('team_size').default(7).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_futebol_schedules_user').on(table.userId),
  }),
);

export const footballGuests = futebolSchema.table(
  'guests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => footballUsers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    gameDate: varchar('game_date', { length: 20 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_futebol_guests_user').on(table.userId),
    userDateIdx: index('idx_futebol_guests_user_date').on(table.userId, table.gameDate),
  }),
);

export type FootballPoolGuessTeam = { name: string; score: number };

export const footballPools = futebolSchema.table(
  'pools',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => footballUsers.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id').notNull().references(() => footballMatches.id, { onDelete: 'cascade' }),
    prize: text('prize').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('idx_futebol_pools_user').on(table.userId),
  }),
);

export const footballPoolGuesses = futebolSchema.table(
  'pool_guesses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    poolId: uuid('pool_id').notNull().references(() => footballPools.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    birthDate: varchar('birth_date', { length: 10 }).notNull(),
    guessTeams: jsonb('guess_teams').$type<FootballPoolGuessTeam[]>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    poolIdx: index('idx_futebol_pool_guesses_pool').on(table.poolId),
  }),
);

export type FootballUser = typeof footballUsers.$inferSelect;
export type FootballPlayer = typeof footballPlayers.$inferSelect;
export type FootballMatch = typeof footballMatches.$inferSelect;
export type FootballSchedule = typeof footballSchedules.$inferSelect;
export type FootballGuest = typeof footballGuests.$inferSelect;
export type FootballPool = typeof footballPools.$inferSelect;
export type FootballPoolGuess = typeof footballPoolGuesses.$inferSelect;
