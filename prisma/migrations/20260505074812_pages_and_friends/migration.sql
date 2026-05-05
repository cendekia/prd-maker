-- CreateEnum
CREATE TYPE "VersionKind" AS ENUM ('AUTO', 'MANUAL', 'PRE_AI');

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contentJson" JSONB,
    "contentText" TEXT NOT NULL DEFAULT '',
    "yDocState" BYTEA,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publicSlug" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "yDocState" BYTEA,
    "kind" "VersionKind" NOT NULL DEFAULT 'AUTO',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "anchor" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contentJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagePermission" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "PagePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Page_publicSlug_key" ON "Page"("publicSlug");

-- CreateIndex
CREATE INDEX "Page_workspaceId_parentId_idx" ON "Page"("workspaceId", "parentId");

-- CreateIndex
CREATE INDEX "Page_workspaceId_archivedAt_idx" ON "Page"("workspaceId", "archivedAt");

-- CreateIndex
CREATE INDEX "Page_parentId_position_idx" ON "Page"("parentId", "position");

-- CreateIndex
CREATE INDEX "PageVersion_pageId_createdAt_idx" ON "PageVersion"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_pageId_idx" ON "Comment"("pageId");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Template_workspaceId_idx" ON "Template"("workspaceId");

-- CreateIndex
CREATE INDEX "PagePermission_pageId_idx" ON "PagePermission"("pageId");

-- CreateIndex
CREATE INDEX "PagePermission_userId_idx" ON "PagePermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PagePermission_pageId_userId_key" ON "PagePermission"("pageId", "userId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageVersion" ADD CONSTRAINT "PageVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagePermission" ADD CONSTRAINT "PagePermission_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagePermission" ADD CONSTRAINT "PagePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
