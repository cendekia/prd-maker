-- AlterTable
ALTER TABLE "User" ADD COLUMN     "anthropicKeyCipher" TEXT,
ADD COLUMN     "anthropicKeyIv" TEXT,
ADD COLUMN     "anthropicKeyLast4" TEXT,
ADD COLUMN     "anthropicKeyTag" TEXT;

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsage_workspaceId_idx" ON "AiUsage"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_workspaceId_period_key" ON "AiUsage"("workspaceId", "period");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
