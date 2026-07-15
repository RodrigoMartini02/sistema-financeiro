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

export const footballChampionshipMatches = futebolSchema.table(
  'championship_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    competition: varchar('competition', { length: 10 }).notNull(),
    externalMatchId: varchar('external_match_id', { length: 50 }).notNull().unique(),
    homeTeam: varchar('home_team', { length: 255 }).notNull(),
    awayTeam: varchar('away_team', { length: 255 }).notNull(),
    matchDate: timestamp('match_date').notNull(),
    open: boolean('open').default(true).notNull(),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    finished: boolean('finished').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    openIdx: index('idx_futebol_champ_matches_open').on(table.open),
  }),
);

export const footballChampionshipGuesses = futebolSchema.table(
  'championship_guesses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id').notNull().references(() => footballChampionshipMatches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => footballUsers.id, { onDelete: 'cascade' }),
    homeScore: integer('home_score').notNull(),
    awayScore: integer('away_score').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    matchUserUnique: uniqueIndex('idx_futebol_champ_guesses_match_user').on(table.matchId, table.userId),
  }),
);

export type FootballUser = typeof footballUsers.$inferSelect;
export type FootballPlayer = typeof footballPlayers.$inferSelect;
export type FootballMatch = typeof footballMatches.$inferSelect;
export type FootballSchedule = typeof footballSchedules.$inferSelect;
export type FootballGuest = typeof footballGuests.$inferSelect;
export type FootballChampionshipMatch = typeof footballChampionshipMatches.$inferSelect;
export type FootballChampionshipGuess = typeof footballChampionshipGuesses.$inferSelect;
