-- CreateEnum
CREATE TYPE "StackType" AS ENUM ('FRONTEND', 'BACKEND', 'API', 'WEBSOCKET', 'EMAIL', 'MOBILE', 'INFRA', 'OTHER');

-- CreateEnum
CREATE TYPE "FeatureStatus" AS ENUM ('SUGGESTED', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "AgentOrigin" AS ENUM ('AGENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "FeatureLinkKind" AS ENUM ('DEPENDS_ON', 'CONSUMES', 'TRIGGERS', 'EXTENDS', 'IMPACTS', 'RELATES_TO');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PageFeatureRole" AS ENUM ('DEFINES', 'MODIFIES', 'REFERENCES');

-- CreateEnum
CREATE TYPE "ImpactRunStatus" AS ENUM ('RUNNING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentJobType" AS ENUM ('SCAN_WORKSPACE', 'EXTRACT_PAGE');

-- CreateEnum
CREATE TYPE "AgentJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Stack" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StackType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#5333D8',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "FeatureStatus" NOT NULL DEFAULT 'SUGGESTED',
    "origin" "AgentOrigin" NOT NULL DEFAULT 'AGENT',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromFeatureId" TEXT NOT NULL,
    "toFeatureId" TEXT NOT NULL,
    "kind" "FeatureLinkKind" NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "origin" "AgentOrigin" NOT NULL DEFAULT 'AGENT',
    "confidence" DOUBLE PRECISION,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageFeature" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "role" "PageFeatureRole" NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "origin" "AgentOrigin" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpactAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "status" "ImpactRunStatus" NOT NULL DEFAULT 'RUNNING',
    "report" JSONB,
    "model" TEXT,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpactAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "AgentJobType" NOT NULL,
    "pageId" TEXT,
    "status" "AgentJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stack_workspaceId_position_idx" ON "Stack"("workspaceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Stack_workspaceId_name_key" ON "Stack"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Feature_workspaceId_stackId_idx" ON "Feature"("workspaceId", "stackId");

-- CreateIndex
CREATE INDEX "Feature_workspaceId_status_idx" ON "Feature"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "FeatureLink_workspaceId_status_idx" ON "FeatureLink"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "FeatureLink_toFeatureId_idx" ON "FeatureLink"("toFeatureId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureLink_fromFeatureId_toFeatureId_kind_key" ON "FeatureLink"("fromFeatureId", "toFeatureId", "kind");

-- CreateIndex
CREATE INDEX "PageFeature_featureId_idx" ON "PageFeature"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "PageFeature_pageId_featureId_role_key" ON "PageFeature"("pageId", "featureId", "role");

-- CreateIndex
CREATE INDEX "ImpactAnalysis_pageId_createdAt_idx" ON "ImpactAnalysis"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "ImpactAnalysis_workspaceId_idx" ON "ImpactAnalysis"("workspaceId");

-- CreateIndex
CREATE INDEX "AgentJob_status_createdAt_idx" ON "AgentJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentJob_workspaceId_type_pageId_idx" ON "AgentJob"("workspaceId", "type", "pageId");

-- AddForeignKey
ALTER TABLE "Stack" ADD CONSTRAINT "Stack_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureLink" ADD CONSTRAINT "FeatureLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureLink" ADD CONSTRAINT "FeatureLink_fromFeatureId_fkey" FOREIGN KEY ("fromFeatureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureLink" ADD CONSTRAINT "FeatureLink_toFeatureId_fkey" FOREIGN KEY ("toFeatureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageFeature" ADD CONSTRAINT "PageFeature_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageFeature" ADD CONSTRAINT "PageFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactAnalysis" ADD CONSTRAINT "ImpactAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactAnalysis" ADD CONSTRAINT "ImpactAnalysis_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactAnalysis" ADD CONSTRAINT "ImpactAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentJob" ADD CONSTRAINT "AgentJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
