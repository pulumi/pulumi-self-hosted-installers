import * as pulumi from "@pulumi/pulumi";

const stackConfig = new pulumi.Config();

const projectName = pulumi.getProject();
const stackName = pulumi.getStack();

const commonName = stackConfig.get("commonName") || "pulumiselfhosted";
const resourceNamePrefix = `${commonName}-${stackName}`;

const dbInstanceType = stackConfig.get("dbInstanceType") || "db-g1-small";
const dbUser = stackConfig.get("dbUser") || "pulumiadmin";
const dbEnableGeneralLog = stackConfig.get("dbEnableGeneralLog") === "true"; // Default: false (performance impact)
const dbBackupRetentionDays = stackConfig.getNumber("dbBackupRetentionDays") || 30;
const dbMaintenanceDay = stackConfig.getNumber("dbMaintenanceDay") || 1; // Sunday
const dbMaintenanceHour = stackConfig.getNumber("dbMaintenanceHour") || 3; // 3 AM

export const config = {
  projectName,
  stackName,
  resourceNamePrefix,
  dbInstanceType,
  dbUser,
  dbEnableGeneralLog,
  dbBackupRetentionDays,
  dbMaintenanceDay,
  dbMaintenanceHour,
  baseTags: {
    project: projectName,
    stack: stackName,
  },
};
