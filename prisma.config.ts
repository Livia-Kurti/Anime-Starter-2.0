// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mongodb"
  // This correctly references the connection string in your .env file
  url      = env("DATABASE_URL") 
}

// =========================================================
// ENUM: AnimeStatus
// =========================================================
enum AnimeStatus {
  WANT_TO_WATCH
  NOT_INTERESTED
  WATCHING
  COMPLETED 
  PAUSED
  DROPPED
}

// =========================================================
// USER Model
// =========================================================
model User {
  id      String @id @default(auto()) @map("_id") @db.ObjectId
  email   String @unique
  username String @unique
  
  list    UserAnimeList[]
}

// =========================================================
// ANIME Model (External Data)
// =========================================================
model Anime {
  // Standard MongoDB ObjectId as the internal primary key
  id          String  @id @default(auto()) @map("_id") @db.ObjectId 
  
  // Unique identifier from the Jikan API (used for upsert/lookup)
  jikanId     Int     @unique 
  
  title       String 
  image       String? // Storing the image URL saves Jikan API calls later

  usersOnList UserAnimeList[]
}

// =========================================================
// JOINING MODEL: UserAnimeList (The Tracking Entry)
// =========================================================
model UserAnimeList {
  id             String      @id @default(auto()) @map("_id") @db.ObjectId
  
  // Foreign Keys
  userId         String      @db.ObjectId
  animeId        String      @db.ObjectId

  // Tracking Fields
  status         AnimeStatus @default(WANT_TO_WATCH) 
  currentEpisode Int         @default(0) 
  score          Int?        
  updatedAt      DateTime    @updatedAt
  
  // Relations
  user           User        @relation(fields: [userId], references: [id])
  anime          Anime       @relation(fields: [animeId], references: [id])

  @@unique([userId, animeId]) 
}