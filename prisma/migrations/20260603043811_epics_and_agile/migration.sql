-- CreateEnum
CREATE TYPE "EpicStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "AgileStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "agileStatus" "AgileStatus" NOT NULL DEFAULT 'BACKLOG',
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "epicId" TEXT,
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "priority" "Priority",
ADD COLUMN     "storyPoints" INTEGER,
ADD COLUMN     "targetSprint" TEXT;

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled epic',
    "description" TEXT,
    "status" "EpicStatus" NOT NULL DEFAULT 'PLANNED',
    "color" TEXT NOT NULL DEFAULT '#5333D8',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Epic_workspaceId_status_idx" ON "Epic"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Epic_workspaceId_key_key" ON "Epic"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "Page_workspaceId_epicId_idx" ON "Page"("workspaceId", "epicId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
