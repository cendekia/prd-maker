-- CreateEnum
CREATE TYPE "GuideCheckStatus" AS ENUM ('RUNNING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "GuideCheck" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "status" "GuideCheckStatus" NOT NULL DEFAULT 'RUNNING',
    "report" JSONB,
    "model" TEXT,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuideCheck_pageId_key" ON "GuideCheck"("pageId");

-- CreateIndex
CREATE INDEX "GuideCheck_workspaceId_idx" ON "GuideCheck"("workspaceId");

-- CreateIndex
CREATE INDEX "Page_templateId_idx" ON "Page"("templateId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideCheck" ADD CONSTRAINT "GuideCheck_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideCheck" ADD CONSTRAINT "GuideCheck_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideCheck" ADD CONSTRAINT "GuideCheck_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
