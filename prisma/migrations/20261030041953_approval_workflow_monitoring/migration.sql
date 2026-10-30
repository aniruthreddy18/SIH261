-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "StageConfig" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleRole" TEXT NOT NULL,
    "slaDays" INTEGER NOT NULL,
    "newInstitutionSlaDays" INTEGER,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 3,
    "escalateL2AfterDays" INTEGER NOT NULL DEFAULT 3,
    "escalateL3AfterDays" INTEGER NOT NULL DEFAULT 10,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PathwayConfig" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stagesJson" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ApplicationTypeRoute" (
    "applicationType" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "pathwayCode" TEXT NOT NULL,
    "isNewInstitution" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StageInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "stageCode" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "completedById" TEXT,
    "completedByName" TEXT,
    "outcome" TEXT,
    "remarks" TEXT,
    "reference" TEXT,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StageInstance_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvcVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "stageInstanceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_SCHEDULE',
    "scheduleBy" DATETIME NOT NULL,
    "visitDate" DATETIME,
    "committeeJson" TEXT NOT NULL DEFAULT '[]',
    "convenorId" TEXT,
    "convenorName" TEXT,
    "scheduledById" TEXT,
    "scheduledByName" TEXT,
    "scheduledAt" DATETIME,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "reportSubmittedAt" DATETIME,
    "recommendation" TEXT,
    "reportSummary" TEXT,
    "reportReference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvcVisit_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvcVisit_stageInstanceId_fkey" FOREIGN KEY ("stageInstanceId") REFERENCES "StageInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "institutionId" TEXT NOT NULL,
    "applicationId" TEXT,
    "kind" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "closedNote" TEXT,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ComplianceItem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComplianceItem_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "newValidUntil" DATETIME,
    "newReference" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedByName" TEXT NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewerName" TEXT,
    "reviewRemarks" TEXT,
    "reviewedAt" DATETIME,
    CONSTRAINT "ComplianceSubmission_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ComplianceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "applicationId" TEXT,
    "institutionId" TEXT,
    "regionId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "severity" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "recipientRoles" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "acknowledgedAt" DATETIME,
    "acknowledgedBy" TEXT,
    "acknowledgeNote" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "institutionCode" TEXT,
    "institutionCategory" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "applicationType" TEXT NOT NULL DEFAULT 'EXTENSION_OF_APPROVAL',
    "pathwayCode" TEXT,
    "pathwayStagesJson" TEXT,
    "currentStage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "createdById" TEXT NOT NULL,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ApplicationTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("academicYear", "contactEmail", "contactName", "contactPhone", "createdAt", "createdById", "id", "institutionCategory", "institutionCode", "institutionId", "institutionName", "reference", "status", "submittedAt", "templateId", "updatedAt") SELECT "academicYear", "contactEmail", "contactName", "contactPhone", "createdAt", "createdById", "id", "institutionCategory", "institutionCode", "institutionId", "institutionName", "reference", "status", "submittedAt", "templateId", "updatedAt" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE UNIQUE INDEX "Application_reference_key" ON "Application"("reference");
CREATE INDEX "Application_status_idx" ON "Application"("status");
CREATE INDEX "Application_institutionId_idx" ON "Application"("institutionId");
CREATE INDEX "Application_currentStage_idx" ON "Application"("currentStage");
CREATE TABLE "new_Institution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "establishedYear" INTEGER,
    "regionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Institution_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Institution" ("category", "city", "code", "createdAt", "establishedYear", "id", "name", "state") SELECT "category", "city", "code", "createdAt", "establishedYear", "id", "name", "state" FROM "Institution";
DROP TABLE "Institution";
ALTER TABLE "new_Institution" RENAME TO "Institution";
CREATE UNIQUE INDEX "Institution_code_key" ON "Institution"("code");
CREATE INDEX "Institution_regionId_idx" ON "Institution"("regionId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "institutionId" TEXT,
    "regionId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("active", "createdAt", "designation", "email", "id", "institutionId", "lastLoginAt", "name", "passwordHash", "role", "updatedAt") SELECT "active", "createdAt", "designation", "email", "id", "institutionId", "lastLoginAt", "name", "passwordHash", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_institutionId_idx" ON "User"("institutionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE INDEX "StageInstance_applicationId_enteredAt_idx" ON "StageInstance"("applicationId", "enteredAt");

-- CreateIndex
CREATE INDEX "StageInstance_status_dueAt_idx" ON "StageInstance"("status", "dueAt");

-- CreateIndex
CREATE INDEX "StageInstance_stageCode_status_idx" ON "StageInstance"("stageCode", "status");

-- CreateIndex
CREATE INDEX "EvcVisit_status_scheduleBy_idx" ON "EvcVisit"("status", "scheduleBy");

-- CreateIndex
CREATE INDEX "EvcVisit_convenorId_idx" ON "EvcVisit"("convenorId");

-- CreateIndex
CREATE INDEX "EvcVisit_applicationId_idx" ON "EvcVisit"("applicationId");

-- CreateIndex
CREATE INDEX "ComplianceItem_institutionId_idx" ON "ComplianceItem"("institutionId");

-- CreateIndex
CREATE INDEX "ComplianceItem_kind_status_dueDate_idx" ON "ComplianceItem"("kind", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ComplianceSubmission_itemId_submittedAt_idx" ON "ComplianceSubmission"("itemId", "submittedAt");

-- CreateIndex
CREATE INDEX "ComplianceSubmission_review_idx" ON "ComplianceSubmission"("review");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "Alert_kind_createdAt_idx" ON "Alert"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_subjectType_subjectId_idx" ON "Alert"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Alert_resolvedAt_idx" ON "Alert"("resolvedAt");
