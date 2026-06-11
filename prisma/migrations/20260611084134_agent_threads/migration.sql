-- CreateTable
CREATE TABLE "AgentThread" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolUse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentThread_userId_idx" ON "AgentThread"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentThread_workspaceId_userId_key" ON "AgentThread"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "AgentMessage_threadId_createdAt_idx" ON "AgentMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentThread" ADD CONSTRAINT "AgentThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentThread" ADD CONSTRAINT "AgentThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AgentThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
