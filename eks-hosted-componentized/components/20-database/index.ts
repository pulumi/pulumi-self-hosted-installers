import * as pulumi from "@pulumi/pulumi";
import { RdsDatabase } from "./rds-db";

interface DbConn {
  host: pulumi.Output<string>;
  port: pulumi.Output<string>;
  username: pulumi.Output<string>;
  password: pulumi.Output<string>;
}

export interface DatabaseOutputs {
  dbConn: DbConn;
}

export interface DatabaseArgs {
  // From IAM stack
  databaseMonitoringRoleArn: pulumi.Output<string>;
  // From networking stack
  privateSubnetIds: pulumi.Output<string[]>;
  // From EKS cluster stack
  nodeSecurityGroupId: pulumi.Output<string>;
}

export class DatabaseResources extends pulumi.ComponentResource {
  public readonly dbConn: DbConn;
  public readonly dbPassword: pulumi.Output<string>;

  constructor(
    name: string,
    args: DatabaseArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("eks-self-hosted:index:Database", name, {}, opts);

    const config = new pulumi.Config();
    const dbReplicas = config.getNumber("dbReplicas") ?? 2;
    const dbInstanceType = config.get("dbInstanceType") || "db.r5.large";

    // Get existing database info from config
    const dbHostEndpoint = config.get("dbHostEndpoint");
    const dbPort = config.get("dbPort");
    const dbUsername = config.get("dbUsername");
    const dbPassword = config.getSecret("dbPassword");

    // Validate required args
    if (
      !args.databaseMonitoringRoleArn ||
      !args.privateSubnetIds ||
      !args.nodeSecurityGroupId
    ) {
      throw new Error(
        "Missing required arguments: databaseMonitoringRoleArn, privateSubnetIds, nodeSecurityGroupId"
      );
    }

    // Deploy RDS Aurora DB if not using an existing database.
    if (dbHostEndpoint && dbPort && dbUsername && dbPassword) {
      // Use existing DB info
      this.dbConn = {
        host: pulumi.output(dbHostEndpoint),
        port: pulumi.output(dbPort),
        username: pulumi.output(dbUsername),
        password: dbPassword,
      };
    } else {
      // Create a new RDS Aurora DB.
      const rds = new RdsDatabase(
        "rds-aurora-db",
        {
          privateSubnetIds: args.privateSubnetIds,
          securityGroupId: args.nodeSecurityGroupId,
          databaseMonitoringRoleArn: args.databaseMonitoringRoleArn,
          replicas: dbReplicas,
          instanceType: dbInstanceType,
        },
        { parent: this }
      );
      const db = rds.db;

      // Export the DB connection information.
      this.dbConn = {
        host: db.endpoint,
        port: db.port.apply((port) => port.toString()),
        username: db.masterUsername,
        password: rds.password, // db.masterPassword can possibly be undefined. Use rds.password instead.
      };
      this.dbPassword = rds.password;
    }

    this.registerOutputs({
      dbConn: this.dbConn,
      dbPassword: this.dbPassword,
    });
  }
}
